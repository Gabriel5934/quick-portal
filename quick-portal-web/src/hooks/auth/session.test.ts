import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocks } from "../../test/web-locks";
import {
  ACCESS_TOKEN_QUERY_KEY,
  REFRESH_LOCK_NAME,
  SESSION_CHANNEL_NAME,
  discardPendingRefreshes,
  ensureSession,
  listenForLogout,
  refreshAccessToken,
  requireSession,
} from "./session";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function flushMicrotasks() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

describe("session", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "locks");
  });

  describe("boot refresh", () => {
    it("exchanges the refresh cookie once and keeps the token in memory", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { access: "boot-access" }));
      localStorage.setItem("token", "old-access");
      localStorage.setItem("refreshToken", "old-refresh");
      const queryClient = newQueryClient();

      await expect(
        requireSession(queryClient, "/sales"),
      ).resolves.toBeUndefined();
      await requireSession(queryClient, "/acessos");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url as string).toMatch(/\/api\/token\/refresh\/$/);
      expect(init).toMatchObject({
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "quick-portal" },
      });
      expect(init?.body).toBeUndefined();
      expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBe(
        "boot-access",
      );
      expect(localStorage.getItem("token")).toBeNull();
      expect(localStorage.getItem("refreshToken")).toBeNull();
    });

    it("waits for the refresh before redirecting a visitor without a session", async () => {
      const response = deferred<Response>();
      fetchMock.mockReturnValue(response.promise);
      const queryClient = newQueryClient();

      let settled = false;
      const guard = requireSession(queryClient, "/sales?page=2").finally(() => {
        settled = true;
      });
      await flushMicrotasks();
      expect(settled).toBe(false);

      response.resolve(jsonResponse(401, { detail: "missing" }));
      const error: unknown = await guard.catch((caught: unknown) => caught);

      expect(isRedirect(error)).toBe(true);
      expect(error).toMatchObject({
        options: { to: "/", search: { redirect: "/sales?page=2" } },
      });
      expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
    });

    it("does not refresh again after login or logout stored the token", async () => {
      const queryClient = newQueryClient();

      queryClient.setQueryData(ACCESS_TOKEN_QUERY_KEY, "login-access");
      await expect(ensureSession(queryClient)).resolves.toBe("login-access");
      queryClient.setQueryData(ACCESS_TOKEN_QUERY_KEY, null);
      await expect(ensureSession(queryClient)).resolves.toBeNull();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("treats a failed refresh request as no session", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(ensureSession(newQueryClient())).resolves.toBeNull();
    });
  });

  describe("locked refresh", () => {
    it("runs every refresh under the shared lock, one at a time", async () => {
      const request = installLocks();
      const first = deferred<Response>();
      const second = deferred<Response>();
      fetchMock
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      const queryClient = newQueryClient();

      const firstCall = refreshAccessToken(queryClient);
      const secondCall = refreshAccessToken(queryClient);
      await flushMicrotasks();

      expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.calls.map(([name]) => name)).toEqual([
        REFRESH_LOCK_NAME,
        REFRESH_LOCK_NAME,
      ]);
      // The second refresh must not present the cookie the first is rotating.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      first.resolve(jsonResponse(200, { access: "first-access" }));
      await expect(firstCall).resolves.toBe("first-access");
      await flushMicrotasks();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      second.resolve(jsonResponse(200, { access: "second-access" }));
      await expect(secondCall).resolves.toBe("second-access");
    });

    it("reuses a token stored while it waited for the lock", async () => {
      installLocks();
      const first = deferred<Response>();
      fetchMock.mockReturnValueOnce(first.promise);
      const queryClient = newQueryClient();

      const firstCall = refreshAccessToken(queryClient);
      const waitingCall = refreshAccessToken(queryClient);
      await flushMicrotasks();
      queryClient.setQueryData(ACCESS_TOKEN_QUERY_KEY, "first-access");
      first.resolve(jsonResponse(200, { access: "first-access" }));

      await expect(firstCall).resolves.toBe("first-access");
      await expect(waitingCall).resolves.toBe("first-access");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("refreshes when the cached token predates the request", async () => {
      installLocks();
      fetchMock.mockResolvedValue(jsonResponse(200, { access: "new-access" }));
      const queryClient = newQueryClient();
      queryClient.setQueryData(ACCESS_TOKEN_QUERY_KEY, "stale-access", {
        updatedAt: Date.now() - 5 * 60 * 1000,
      });

      await expect(refreshAccessToken(queryClient)).resolves.toBe("new-access");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("logout guard", () => {
    it("discards a refresh that completes after a logout started", async () => {
      const response = deferred<Response>();
      fetchMock.mockReturnValueOnce(response.promise);
      const queryClient = newQueryClient();

      const boot = ensureSession(queryClient);
      await flushMicrotasks();
      discardPendingRefreshes();
      response.resolve(jsonResponse(200, { access: "late-access" }));

      await expect(boot).resolves.toBeNull();
      expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
    });

    it("skips the request of a refresh that waited for a logout", async () => {
      installLocks();
      const logout = deferred<void>();
      const holdLock = navigator.locks.request(REFRESH_LOCK_NAME, () => {
        discardPendingRefreshes();
        return logout.promise;
      });
      const queryClient = newQueryClient();

      // Started before the logout bumped the generation, then queued.
      const waiting = refreshAccessToken(queryClient);
      await flushMicrotasks();
      logout.resolve();
      await holdLock;

      await expect(waiting).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("still refreshes once the logout is over", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { access: "next-access" }));
      discardPendingRefreshes();

      await expect(refreshAccessToken(newQueryClient())).resolves.toBe(
        "next-access",
      );
    });
  });

  describe("cross-tab logout", () => {
    it("clears this tab's session when another tab logs out", async () => {
      const queryClient = newQueryClient();
      queryClient.setQueryData(ACCESS_TOKEN_QUERY_KEY, "access-token");
      queryClient.setQueryData(["businesses", "all"], [{ id: 1 }]);
      localStorage.setItem("userEmail", "user@example.com");
      const stopListening = listenForLogout(queryClient);
      const otherTab = new BroadcastChannel(SESSION_CHANNEL_NAME);
      const received = new Promise((resolve) => {
        queryClient.getQueryCache().subscribe((event) => {
          if (event.type === "updated") resolve(event);
        });
      });

      try {
        otherTab.postMessage({ type: "logout" });
        await received;
      } finally {
        otherTab.close();
        stopListening();
      }

      expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
      expect(queryClient.getQueryData(["businesses", "all"])).toBeUndefined();
      expect(localStorage.getItem("userEmail")).toBeNull();
    });
  });
});
