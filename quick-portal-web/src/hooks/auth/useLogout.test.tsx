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
import { LOGOUT_RETRIES, LOGOUT_TIMEOUT_MS, useLogout } from "./useLogout";
import { LOGIN_TIMEOUT_MS, useLogin } from "./useToken";

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

function isLoginCall([url]: Parameters<typeof fetch>) {
  return (url as string).endsWith("/api/token/");
}

function loginCalls() {
  return fetchMock.mock.calls.filter(isLoginCall);
}

function loginOk(access: string) {
  return new Response(JSON.stringify({ access }), { status: 200 });
}

function sessionGeneration() {
  return localStorage.getItem("sessionGeneration");
}

/** Another tab's login: takes the lock and bumps the shared generation. */
function otherTabLogin() {
  return navigator.locks.request(REFRESH_LOCK_NAME, () => {
    localStorage.setItem(
      "sessionGeneration",
      String(Number(sessionGeneration()) + 1),
    );
    return Promise.resolve();
  });
}

function renderLoginAndLogout(queryClient: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return renderHook(() => ({ login: useLogin(), logout: useLogout() }), {
    wrapper: Wrapper,
  });
}

function logoutMutationStatus(queryClient: QueryClient) {
  return queryClient.getMutationCache().getAll()[0]?.state.status;
}

/** A response that never comes; rejects with the reason when aborted. */
function neverAnswers(init?: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(init.signal?.reason as Error),
    );
  });
}

/** Headers arrive, the body never ends; the read fails when aborted. */
function stalledBody(init?: RequestInit) {
  return new Response(
    new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener("abort", () =>
          controller.error(init.signal?.reason),
        );
      },
    }),
    { status: 200 },
  );
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

  it("aborts a logout request that never answers and retries it", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    fetchMock
      .mockImplementationOnce((_url, init) => {
        signals.push(init!.signal!);
        return neverAnswers(init);
      })
      .mockImplementationOnce((_url, init) => {
        signals.push(init!.signal!);
        return Promise.resolve(noContent());
      });
    const queryClient = loggedInClient();
    const { result } = renderLogout(queryClient);

    await act(() => result.current());
    await act(() => vi.advanceTimersByTimeAsync(0));
    // The session is gone while the request hangs.
    expectSessionCleared(queryClient);
    expect(logoutCalls()).toHaveLength(1);
    expect(logoutCalls()[0][1]).toMatchObject({ keepalive: true });

    await act(() => vi.advanceTimersByTimeAsync(LOGOUT_TIMEOUT_MS - 1));
    expect(signals[0].aborted).toBe(false);
    expect(logoutCalls()).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(signals[0].aborted).toBe(true);
    expect((signals[0].reason as DOMException).name).toBe("TimeoutError");

    await runRetries();
    expect(logoutCalls()).toHaveLength(2);
    // The answered attempt cleared its timer and was not aborted.
    expect(signals[1].aborted).toBe(false);
    expect(logoutMutationStatus(queryClient)).toBe("success");
    expect(logoutFailureLogs(consoleError)).toHaveLength(0);
    expectSessionCleared(queryClient);
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

describe("login and logout race", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    navigate.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    consoleError.mockRestore();
    Reflect.deleteProperty(navigator, "locks");
    localStorage.clear();
  });

  it("logs in only after an in-flight logout released the lock, then bumps the generation", async () => {
    const request = installLocks();
    const logoutResponse = deferred<Response>();
    fetchMock.mockImplementation((url) =>
      isLoginCall([url])
        ? Promise.resolve(loginOk("new-access"))
        : logoutResponse.promise,
    );
    const queryClient = loggedInClient();
    const { result } = renderLoginAndLogout(queryClient);

    await act(() => result.current.logout());
    await vi.waitFor(() => expect(logoutCalls()).toHaveLength(1));

    let login!: Promise<unknown>;
    act(() => {
      login = result.current.login.mutateAsync({
        email: "User@Example.com",
        password: "secret",
      });
    });
    await flushMicrotasks();

    // Login is queued behind the logout that holds the lock.
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(([name]) => name)).toEqual([
      REFRESH_LOCK_NAME,
      REFRESH_LOCK_NAME,
    ]);
    expect(loginCalls()).toHaveLength(0);
    expect(sessionGeneration()).toBeNull();

    logoutResponse.resolve(noContent());
    await act(() => login);

    expect(loginCalls()).toHaveLength(1);
    expect(isLoginCall(fetchMock.mock.calls[1])).toBe(true);
    expect(sessionGeneration()).toBe("1");
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBe("new-access");
    expect(localStorage.getItem("userEmail")).toBe("user@example.com");
    // Login took the lock once and did not nest it.
    expect(request).toHaveBeenCalledTimes(2);
    expect(logoutCalls()).toHaveLength(1);
  });

  it("does not bump the generation when login fails", async () => {
    const request = installLocks();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: ["No active account with these credentials."],
        }),
        { status: 401 },
      ),
    );
    const queryClient = new QueryClient();
    const { result } = renderLoginAndLogout(queryClient);

    await act(() =>
      expect(
        result.current.login.mutateAsync({
          email: "user@example.com",
          password: "wrong",
        }),
      ).rejects.toThrow("No active account with these credentials."),
    );

    expect(sessionGeneration()).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    // The lock was released.
    await expect(otherTabLogin()).resolves.toBeUndefined();
  });

  it("shows the detail message of a rejected login", async () => {
    installLocks();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Origin not allowed." }), {
        status: 403,
      }),
    );
    const { result } = renderLoginAndLogout(new QueryClient());

    await act(() =>
      expect(
        result.current.login.mutateAsync({
          email: "user@example.com",
          password: "secret",
        }),
      ).rejects.toThrow(new Error("Origin not allowed.")),
    );
  });

  it("shows a generic message when a failed login has no JSON body", async () => {
    installLocks();
    fetchMock.mockResolvedValue(new Response("Bad Gateway", { status: 502 }));
    const { result } = renderLoginAndLogout(new QueryClient());

    await act(() =>
      expect(
        result.current.login.mutateAsync({
          email: "user@example.com",
          password: "secret",
        }),
      ).rejects.toThrow(new Error("Erro ao entrar.")),
    );
  });

  it("skips the logout request when another tab logged in before the attempt", async () => {
    vi.useFakeTimers();
    installLocks();
    const otherLogin = deferred<void>();
    // Another tab's login holds the lock and bumps the generation before
    // releasing it.
    const holdLock = navigator.locks.request(REFRESH_LOCK_NAME, async () => {
      await otherLogin.promise;
      localStorage.setItem("sessionGeneration", "1");
    });
    fetchMock.mockResolvedValue(noContent());
    const queryClient = loggedInClient();
    const { result } = renderLogout(queryClient);

    await act(() => result.current());
    expectSessionCleared(queryClient);

    otherLogin.resolve();
    await act(() => holdLock);
    await runRetries();

    // The new login's refresh cookie is not blacklisted, and the skipped
    // attempt is a success, not a failure to retry.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logoutMutationStatus(queryClient)).toBe("success");
    expect(logoutFailureLogs(consoleError)).toHaveLength(0);
    // This tab's cache never saw the other tab's token.
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
  });

  it("skips a retry when another tab logged in after a failed attempt", async () => {
    vi.useFakeTimers();
    installLocks();
    let otherLogin: Promise<void> | undefined;
    fetchMock.mockImplementationOnce(() => {
      // Queued behind this attempt, so it runs before the retry.
      otherLogin = otherTabLogin();
      return Promise.resolve(serverError());
    });
    fetchMock.mockResolvedValue(noContent());
    const queryClient = loggedInClient();
    const { result } = renderLogout(queryClient);

    await act(() => result.current());
    await runRetries();
    await otherLogin;

    expect(sessionGeneration()).toBe("1");
    expect(logoutCalls()).toHaveLength(1);
    expect(logoutMutationStatus(queryClient)).toBe("success");
    expect(logoutFailureLogs(consoleError)).toHaveLength(0);
    // Only the marker stopped it: this tab's cache has no token.
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeNull();
  });
});

describe("login timeout", () => {
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.useFakeTimers();
    navigate.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    consoleError.mockRestore();
    Reflect.deleteProperty(navigator, "locks");
    localStorage.clear();
  });

  /** Starts a login; the returned state settles with its value or error. */
  function startLogin(login: ReturnType<typeof useLogin>) {
    const state: { settled: boolean; value?: unknown; error?: unknown } = {
      settled: false,
    };
    act(() => {
      login
        .mutateAsync({ email: "user@example.com", password: "secret" })
        .then(
          (value) => Object.assign(state, { settled: true, value }),
          (error: unknown) => Object.assign(state, { settled: true, error }),
        );
    });
    return state;
  }

  function loginSignal() {
    return loginCalls()[0][1]!.signal!;
  }

  it("aborts a login whose response never arrives and releases the lock", async () => {
    const request = installLocks();
    fetchMock.mockImplementation((_url, init) => neverAnswers(init));
    const queryClient = new QueryClient();
    const { result } = renderLoginAndLogout(queryClient);

    const login = startLogin(result.current.login);
    await act(() => vi.advanceTimersByTimeAsync(LOGIN_TIMEOUT_MS - 1));
    expect(loginCalls()).toHaveLength(1);
    expect(loginSignal().aborted).toBe(false);
    expect(login.settled).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(login.settled).toBe(true);
    expect(login.error).toBeInstanceOf(DOMException);
    expect(login.error).toMatchObject({ name: "TimeoutError" });
    expect(loginSignal().aborted).toBe(true);
    // No new refresh cookie was confirmed, so pending logouts still run.
    expect(sessionGeneration()).toBeNull();
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    // The lock was released.
    await expect(otherTabLogin()).resolves.toBeUndefined();
  });

  it("aborts a login whose response body never finishes and releases the lock", async () => {
    installLocks();
    fetchMock.mockImplementation((_url, init) =>
      Promise.resolve(stalledBody(init)),
    );
    const queryClient = new QueryClient();
    const { result } = renderLoginAndLogout(queryClient);

    const login = startLogin(result.current.login);
    await act(() => vi.advanceTimersByTimeAsync(LOGIN_TIMEOUT_MS - 1));
    // The headers arrived, but the timer still covers reading the body.
    expect(loginCalls()).toHaveLength(1);
    expect(login.settled).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(login.settled).toBe(true);
    expect(login.error).toMatchObject({ name: "TimeoutError" });
    expect(sessionGeneration()).toBeNull();
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBeUndefined();
    await expect(otherTabLogin()).resolves.toBeUndefined();
  });

  it("completes a fast login, bumps the generation and clears its timer", async () => {
    installLocks();
    fetchMock.mockResolvedValue(loginOk("new-access"));
    // No garbage-collection timers, so only the request timer could remain.
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Infinity },
        mutations: { gcTime: Infinity },
      },
    });
    const { result } = renderLoginAndLogout(queryClient);

    const login = startLogin(result.current.login);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(login).toEqual({ settled: true, value: { access: "new-access" } });
    expect(sessionGeneration()).toBe("1");
    expect(queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)).toBe("new-access");
    expect(vi.getTimerCount()).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(LOGIN_TIMEOUT_MS * 2));
    expect(loginSignal().aborted).toBe(false);
  });

  it("lets another tab's queued logout run once a stalled login times out", async () => {
    installLocks();
    fetchMock.mockImplementation((url, init) =>
      isLoginCall([url]) ? neverAnswers(init) : Promise.resolve(noContent()),
    );
    const loginTab = renderLoginAndLogout(new QueryClient());
    const logoutTabClient = loggedInClient();
    const logoutTab = renderLogout(logoutTabClient);

    const login = startLogin(loginTab.result.current.login);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(loginCalls()).toHaveLength(1);

    // The other tab's logout queues behind the login that holds the lock.
    await act(() => logoutTab.result.current());
    await act(() => vi.advanceTimersByTimeAsync(LOGIN_TIMEOUT_MS - 1));
    expect(logoutCalls()).toHaveLength(0);
    expect(logoutMutationStatus(logoutTabClient)).toBe("pending");

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(login.error).toMatchObject({ name: "TimeoutError" });
    await act(() => vi.advanceTimersByTimeAsync(0));

    // The login never confirmed a new cookie, so the logout is not skipped.
    expect(logoutCalls()).toHaveLength(1);
    expect(logoutMutationStatus(logoutTabClient)).toBe("success");
    expect(logoutFailureLogs(consoleError)).toHaveLength(0);
    expect(sessionGeneration()).toBeNull();
  });
});

describe("logout body", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigate.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("does not wait for or time out on a response body it never reads", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      fetchMock.mockImplementation((_url, init) =>
        Promise.resolve(stalledBody(init)),
      );
      const queryClient = loggedInClient();
      const { result } = renderLogout(queryClient);

      await act(() => result.current());
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(logoutMutationStatus(queryClient)).toBe("success");

      await act(() => vi.advanceTimersByTimeAsync(LOGOUT_TIMEOUT_MS * 2));
      // The timer was cleared when the headers arrived: nothing was aborted
      // or retried.
      expect(logoutCalls()).toHaveLength(1);
      expect(logoutCalls()[0][1]!.signal!.aborted).toBe(false);
      expect(logoutFailureLogs(consoleError)).toHaveLength(0);
    } finally {
      consoleError.mockRestore();
    }
  });
});
