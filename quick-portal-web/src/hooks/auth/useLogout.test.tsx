import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocks } from "../../test/web-locks";
import {
  ACCESS_TOKEN_QUERY_KEY,
  REFRESH_LOCK_NAME,
  SESSION_CHANNEL_NAME,
  ensureSession,
  refreshAccessToken,
} from "./session";
import { useLogout } from "./useLogout";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
}));

const fetchMock = vi.fn<typeof fetch>();

function renderLogout(queryClient: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return renderHook(() => useLogout(), { wrapper: Wrapper });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function isLogoutCall([url]: Parameters<typeof fetch>) {
  return (url as string).endsWith("/api/token/logout/");
}

function loggedInClient() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(ACCESS_TOKEN_QUERY_KEY, "access-token");
  queryClient.setQueryData(["businesses", "all"], [{ id: 1 }]);
  localStorage.setItem("userEmail", "user@example.com");
  return queryClient;
}

describe("useLogout", () => {
  beforeEach(() => {
    navigate.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "locks");
    localStorage.clear();
  });

  it.each([
    [
      "the API accepts it",
      () => Promise.resolve(new Response(null, { status: 204 })),
    ],
    [
      "the request fails",
      () => Promise.reject(new TypeError("Failed to fetch")),
    ],
  ])(
    "clears the session and navigates to login when %s",
    async (_, respond) => {
      fetchMock.mockImplementation(respond);
      const queryClient = loggedInClient();
      const { result } = renderLogout(queryClient);

      await act(() => result.current());

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url as string).toMatch(/\/api\/token\/logout\/$/);
      expect(init).toMatchObject({
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "quick-portal" },
      });
      expect(init?.body).toBeUndefined();
      expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
      expect(queryClient.getQueryData(["businesses", "all"])).toBeUndefined();
      expect(localStorage.getItem("userEmail")).toBeNull();
      expect(navigate).toHaveBeenCalledWith({ to: "/" });
    },
  );

  it("waits for an in-flight refresh before calling the logout endpoint", async () => {
    const request = installLocks();
    const refreshResponse = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(refreshResponse.promise)
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const queryClient = loggedInClient();
    // An expiring token, so the refresh really calls the API.
    queryClient.setQueryData(ACCESS_TOKEN_QUERY_KEY, "expiring-access", {
      updatedAt: Date.now() - 5 * 60 * 1000,
    });
    const { result } = renderLogout(queryClient);

    const refresh = refreshAccessToken(queryClient);
    await flushMicrotasks();
    let logout!: Promise<void>;
    act(() => {
      logout = result.current();
    });
    await flushMicrotasks();

    // Logout is queued behind the refresh that holds the lock.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(isLogoutCall)).toBe(false);
    expect(request.mock.calls.map(([name]) => name)).toEqual([
      REFRESH_LOCK_NAME,
      REFRESH_LOCK_NAME,
    ]);

    refreshResponse.resolve(
      new Response(JSON.stringify({ access: "rotated-access" }), {
        status: 200,
      }),
    );
    await act(() => logout);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(isLogoutCall(fetchMock.mock.calls[1])).toBe(true);
    // The refresh finished after logout started, so its token is discarded.
    await expect(refresh).resolves.toBeNull();
    // Logout took the lock once and did not re-enter it.
    expect(request).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
  });

  it("does not let a refresh that finishes after logout set the session", async () => {
    // Without Web Locks logout cannot wait, so only the guard protects it.
    const refreshResponse = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(refreshResponse.promise)
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const queryClient = new QueryClient();
    localStorage.setItem("userEmail", "user@example.com");
    const { result } = renderLogout(queryClient);

    const boot = ensureSession(queryClient);
    await flushMicrotasks();
    await act(() => result.current());
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();

    refreshResponse.resolve(
      new Response(JSON.stringify({ access: "late-access" }), { status: 200 }),
    );

    await expect(boot).resolves.toBeNull();
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
    await expect(ensureSession(queryClient)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears the session under the lock when the logout request fails", async () => {
    const request = installLocks();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const queryClient = loggedInClient();
    const { result } = renderLogout(queryClient);

    await act(() => result.current());

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(REFRESH_LOCK_NAME);
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
    expect(queryClient.getQueryData(["businesses", "all"])).toBeUndefined();
    expect(localStorage.getItem("userEmail")).toBeNull();
    expect(navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("tells the other tabs that the session ended", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const otherTab = new BroadcastChannel(SESSION_CHANNEL_NAME);
    const message = new Promise<unknown>((resolve) => {
      otherTab.onmessage = (event: MessageEvent) => resolve(event.data);
    });
    const { result } = renderLogout(loggedInClient());

    try {
      await act(() => result.current());
      await expect(message).resolves.toEqual({ type: "logout" });
    } finally {
      otherTab.close();
    }
  });
});
