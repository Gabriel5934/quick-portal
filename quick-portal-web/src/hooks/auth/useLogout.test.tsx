import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import {
  type MockInstance,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ApiError } from "#hooks/types";
import { installLocks } from "../../test/web-locks";
import {
  ACCESS_TOKEN_QUERY_KEY,
  REFRESH_LOCK_NAME,
  SESSION_CHANNEL_NAME,
  ensureSession,
  refreshAccessToken,
} from "./session";
import { LOGOUT_RETRIES, useLogout } from "./useLogout";

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

/**
 * Runs past every retry delay (1 + 2 + 4 s) under fake timers. Stops well
 * before the 5 min query gcTime, which would drop the `null` token query.
 */
async function runRetries() {
  await act(() => vi.advanceTimersByTimeAsync(60_000));
}

function isLogoutCall([url]: Parameters<typeof fetch>) {
  return (url as string).endsWith("/api/token/logout/");
}

function logoutCalls() {
  return fetchMock.mock.calls.filter(isLogoutCall);
}

function noContent() {
  return new Response(null, { status: 204 });
}

function serverError() {
  return new Response(null, { status: 500 });
}

function loggedInClient() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(ACCESS_TOKEN_QUERY_KEY, "access-token");
  queryClient.setQueryData(["businesses", "all"], [{ id: 1 }]);
  localStorage.setItem("userEmail", "user@example.com");
  return queryClient;
}

function expectSessionCleared(queryClient: QueryClient) {
  expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
  expect(queryClient.getQueryData(["businesses", "all"])).toBeUndefined();
  expect(localStorage.getItem("userEmail")).toBeNull();
  expect(navigate).toHaveBeenCalledWith({ to: "/" });
}

function logoutFailureLogs(consoleError: MockInstance<typeof console.error>) {
  return consoleError.mock.calls.filter(
    ([message]) => message === "Logout request failed after retries.",
  );
}


describe("useLogout", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    navigate.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    consoleError.mockRestore();
    Reflect.deleteProperty(navigator, "locks");
    localStorage.clear();
  });

  it("clears the session, navigates to login and calls the logout endpoint", async () => {
    fetchMock.mockResolvedValue(noContent());
    const queryClient = loggedInClient();
    const { result } = renderLogout(queryClient);

    await act(() => result.current());

    expectSessionCleared(queryClient);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url as string).toMatch(/\/api\/token\/logout\/$/);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "X-Requested-With": "quick-portal" },
    });
    expect(init?.body).toBeUndefined();
    await flushMicrotasks();
    expect(logoutFailureLogs(consoleError)).toHaveLength(0);
  });

  it("clears the session before the logout request answers", async () => {
    const response = deferred<Response>();
    fetchMock.mockReturnValue(response.promise);
    const queryClient = loggedInClient();
    const { result } = renderLogout(queryClient);

    // Resolves while the request is still pending.
    await act(() => result.current());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expectSessionCleared(queryClient);

    response.resolve(noContent());
    await vi.waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
  });

  it("retries a 500 and keeps the session cleared", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(serverError())
      .mockResolvedValueOnce(serverError())
      .mockResolvedValueOnce(noContent());
    const queryClient = loggedInClient();
    const { result } = renderLogout(queryClient);

    await act(() => result.current());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expectSessionCleared(queryClient);

    // Retries run without a delay between attempts.
    await runRetries();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logoutCalls()).toHaveLength(3);
    expect(logoutFailureLogs(consoleError)).toHaveLength(0);
    expectSessionCleared(queryClient);
  });

  it("logs the failure and keeps the session cleared when every attempt returns 500", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => Promise.resolve(serverError()));
    const queryClient = loggedInClient();
    const { result } = renderLogout(queryClient);

    await act(() => result.current());
    await runRetries();

    expect(fetchMock).toHaveBeenCalledTimes(LOGOUT_RETRIES + 1);
    const logs = logoutFailureLogs(consoleError);
    expect(logs).toHaveLength(1);
    expect(logs[0][1]).toBeInstanceOf(ApiError);
    expect((logs[0][1] as ApiError).status).toBe(500);
    expectSessionCleared(queryClient);
    // No refresh is attempted and nothing restores the session.
    await expect(ensureSession(queryClient)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(LOGOUT_RETRIES + 1);
  });

  it("retries a request that fails with a network error", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(noContent());
    const queryClient = loggedInClient();
    const { result } = renderLogout(queryClient);

    await act(() => result.current());
    expectSessionCleared(queryClient);
    await runRetries();

    expect(logoutCalls()).toHaveLength(2);
    expect(logoutFailureLogs(consoleError)).toHaveLength(0);
    expectSessionCleared(queryClient);
  });

  it("takes the refresh lock once per attempt without nesting it", async () => {
    vi.useFakeTimers();
    const request = installLocks();
    fetchMock.mockImplementation(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    const queryClient = loggedInClient();
    const { result } = renderLogout(queryClient);

    await act(() => result.current());
    await runRetries();

    // The stand-in lock is not reentrant: a nested request would deadlock and
    // stop the attempts after the first one.
    expect(fetchMock).toHaveBeenCalledTimes(LOGOUT_RETRIES + 1);
    expect(request).toHaveBeenCalledTimes(LOGOUT_RETRIES + 1);
    expect(
      request.mock.calls.every(([name]) => name === REFRESH_LOCK_NAME),
    ).toBe(true);
    expect(logoutFailureLogs(consoleError)).toHaveLength(1);
    expectSessionCleared(queryClient);
  });

  it("does not retry the logout after the user logged in again", async () => {
    vi.useFakeTimers();
    const queryClient = loggedInClient();
    // The user logs in again while the first attempt is in flight.
    fetchMock.mockImplementationOnce(() => {
      queryClient.setQueryData(ACCESS_TOKEN_QUERY_KEY, "new-access");
      return Promise.resolve(serverError());
    });
    const { result } = renderLogout(queryClient);

    await act(() => result.current());
    await runRetries();

    // The new session's refresh cookie is not blacklisted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBe("new-access");
    expect(logoutFailureLogs(consoleError)).toHaveLength(0);
  });

  it("waits for an in-flight refresh before calling the logout endpoint", async () => {
    const request = installLocks();
    const refreshResponse = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(refreshResponse.promise)
      .mockResolvedValueOnce(noContent());
    const queryClient = loggedInClient();
    // An expiring token, so the refresh really calls the API.
    queryClient.setQueryData(ACCESS_TOKEN_QUERY_KEY, "expiring-access", {
      updatedAt: Date.now() - 5 * 60 * 1000,
    });
    const { result } = renderLogout(queryClient);

    const refresh = refreshAccessToken(queryClient);
    await flushMicrotasks();
    await act(() => result.current());

    // Logout is queued behind the refresh that holds the lock, but the local
    // session is already gone.
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls.map(([name]) => name)).toEqual([
      REFRESH_LOCK_NAME,
      REFRESH_LOCK_NAME,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.some(isLogoutCall)).toBe(false);
    expectSessionCleared(queryClient);

    refreshResponse.resolve(
      new Response(JSON.stringify({ access: "rotated-access" }), {
        status: 200,
      }),
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(isLogoutCall(fetchMock.mock.calls[1])).toBe(true);
    // The refresh finished after logout started, so its token is discarded.
    await expect(refresh).resolves.toBeNull();
    await vi.waitFor(() => expect(queryClient.isMutating()).toBe(0));
    // Logout took the lock once and did not re-enter it.
    expect(request).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
  });

  it("does not let a refresh that finishes after logout set the session", async () => {
    // Without Web Locks logout cannot wait, so only the guard protects it.
    const refreshResponse = deferred<Response>();
    fetchMock
      .mockReturnValueOnce(refreshResponse.promise)
      .mockResolvedValueOnce(noContent());
    const queryClient = new QueryClient();
    localStorage.setItem("userEmail", "user@example.com");
    const { result } = renderLogout(queryClient);

    const boot = ensureSession(queryClient);
    await flushMicrotasks();
    await act(() => result.current());
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
    await vi.waitFor(() => expect(logoutCalls()).toHaveLength(1));

    refreshResponse.resolve(
      new Response(JSON.stringify({ access: "late-access" }), { status: 200 }),
    );

    await expect(boot).resolves.toBeNull();
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
    await expect(ensureSession(queryClient)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tells the other tabs that the session ended", async () => {
    fetchMock.mockResolvedValue(noContent());
    const otherTab = new BroadcastChannel(SESSION_CHANNEL_NAME);
    const message = new Promise<unknown>((resolve) => {
      otherTab.onmessage = (event: MessageEvent) => resolve(event.data);
    });
    const queryClient = loggedInClient();
    const { result } = renderLogout(queryClient);

    try {
      await act(() => result.current());
      await expect(message).resolves.toEqual({ type: "logout" });
      await vi.waitFor(() => expect(queryClient.isMutating()).toBe(0));
    } finally {
      otherTab.close();
    }
  });
});
