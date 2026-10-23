import {
  MutationObserver,
  mutationOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import {
  clearPendingLogout,
  clearUserEmail,
  getPendingLogout,
  getSessionGeneration,
} from "#hooks/storage";
import { ApiError } from "#hooks/types";
import { fetchWithTimeout } from "./fetchWithTimeout";

/** Query key of the in-memory access token. `null` means "no session". */
export const ACCESS_TOKEN_QUERY_KEY = ["access_token"] as const;

/**
 * Web Lock that serializes logins, refreshes and logouts across tabs of the
 * same origin. Web Locks are not reentrant: code that holds it must never call
 * `refreshAccessToken` or `withRefreshLock` again, or it waits forever.
 */
export const REFRESH_LOCK_NAME = "quick-portal-refresh";

/** Tells the other tabs of this origin that the session ended. */
export const SESSION_CHANNEL_NAME = "quick-portal-session";

/**
 * Required by the cookie-based token endpoints (login, refresh, logout) as a
 * CSRF defense, together with the Origin check done by the API.
 */
export const AUTH_REQUEST_HEADERS = { "X-Requested-With": "quick-portal" };

export type AccessToken = string | null;

async function requestRefresh(): Promise<AccessToken> {
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/token/refresh/`,
    {
      method: "POST",
      credentials: "include",
      headers: AUTH_REQUEST_HEADERS,
    },
  );

  // Missing, expired, rotated or revoked refresh cookie: no session.
  if (res.status === 401) return null;
  if (!res.ok) {
    throw new ApiError(res.status, "Failed to refresh access token.");
  }

  const data = (await res.json().catch(() => null)) as {
    access?: string;
  } | null;
  if (!data?.access) throw new Error("Invalid token response from server.");
  return data.access;
}

/**
 * Incremented when a logout starts. A refresh that started before it returns
 * `null` instead of its token, so a refresh response that arrives after the
 * logout cannot restore the in-memory session.
 */
let logoutGeneration = 0;

/** Discards the result of every refresh started before this call. */
export function discardPendingRefreshes(): void {
  logoutGeneration += 1;
}

/**
 * Runs `callback` while holding the refresh lock, or directly when the
 * browser has no Web Locks. `callback` must not take the lock again.
 */
export function withRefreshLock<T>(callback: () => Promise<T>): Promise<T> {
  const locks = (navigator as Partial<Navigator>).locks;
  if (!locks) return callback();
  return locks.request(REFRESH_LOCK_NAME, callback);
}

/**
 * Exchanges the refresh cookie for a new access token.
 *
 * The API rotates the refresh token on every call and treats a reused token
 * as theft, revoking every session. The Web Lock makes sure only one request
 * per browser is in flight, so each one carries the latest cookie. A token
 * stored in this tab's cache while waiting for the lock is reused instead.
 * Logout takes the same lock, and a logout that starts while this refresh is
 * waiting or in flight makes it resolve to `null`.
 */
export async function refreshAccessToken(
  queryClient: QueryClient,
): Promise<AccessToken> {
  const generation = logoutGeneration;
  const requestedAt = Date.now();
  const token = await withRefreshLock(async () => {
    // Logout started while this refresh waited: do not rotate the cookie.
    if (generation !== logoutGeneration) return null;
    const state = queryClient.getQueryState<AccessToken>(
      ACCESS_TOKEN_QUERY_KEY,
    );
    if (state?.data && state.dataUpdatedAt >= requestedAt) return state.data;
    return requestRefresh();
  });
  return generation === logoutGeneration ? token : null;
}

/**
 * Drops this tab's session state: refreshes in flight, cached queries and
 * mutations, the stored email and the access token, which is set to `null`
 * ("no session") so the guards redirect to login without another refresh.
 */
export function clearSessionState(queryClient: QueryClient): void {
  discardPendingRefreshes();
  clearUserEmail();
  queryClient.getMutationCache().clear();
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== ACCESS_TOKEN_QUERY_KEY[0],
  });
  // Updating the token query in place, instead of removing it, notifies the
  // mounted observers, so the authenticated layout navigates to login.
  queryClient.setQueryData<AccessToken>(ACCESS_TOKEN_QUERY_KEY, null);
}

type SessionMessage = { type: "logout" };

let sessionChannel: BroadcastChannel | null | undefined;

/**
 * One channel per tab, used both to send and to listen: a BroadcastChannel
 * never receives its own messages, so a tab is not notified of its logout.
 */
function getSessionChannel(): BroadcastChannel | null {
  if (sessionChannel === undefined) {
    sessionChannel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(SESSION_CHANNEL_NAME);
  }
  return sessionChannel;
}

/** Notifies the other tabs of this origin that this tab logged out. */
export function announceLogout(): void {
  getSessionChannel()?.postMessage({ type: "logout" } satisfies SessionMessage);
}

/**
 * Clears this tab's session when another tab logs out. Returns a function
 * that stops listening.
 */
export function listenForLogout(queryClient: QueryClient): () => void {
  const channel = getSessionChannel();
  if (!channel) return () => undefined;
  const onMessage = (event: MessageEvent<SessionMessage>) => {
    if (event.data?.type === "logout") clearSessionState(queryClient);
  };
  channel.addEventListener("message", onMessage);
  return () => channel.removeEventListener("message", onMessage);
}

/** Retries after the first attempt, so up to 4 logout requests in total. */
export const LOGOUT_RETRIES = 3;

/**
 * An attempt that gets no answer in this time is aborted and retried. Each
 * attempt holds the refresh lock, so this also bounds how long a stuck logout
 * can delay a login or refresh in any tab.
 */
export const LOGOUT_TIMEOUT_MS = 10_000;

export type LogoutVariables = {
  /** Session generation read when the logout started. */
  initialSessionGeneration: number;
};

async function requestLogout(): Promise<void> {
  // Blacklists the refresh cookie and clears it. `keepalive` lets the request
  // finish after logout navigates away or the tab closes. No body is read, so
  // the timer is cleared as soon as the response arrives.
  const res = await fetchWithTimeout(
    `${import.meta.env.VITE_API_BASE_URL}/api/token/logout/`,
    {
      method: "POST",
      credentials: "include",
      headers: AUTH_REQUEST_HEADERS,
      keepalive: true,
    },
    LOGOUT_TIMEOUT_MS,
  );
  // Throwing makes the mutation retry: while the cookie is not blacklisted,
  // a reload can restore the session from it.
  if (!res.ok) throw new ApiError(res.status, "Failed to log out.");
}

/**
 * The logout request mutation, shared by `useLogout` and by the boot path
 * that resumes a pending logout (`ensureSession`).
 */
export function logoutMutationOptions(queryClient: QueryClient) {
  return mutationOptions({
    // Every attempt waits for a login or refresh in flight in any tab, so the
    // request carries the latest refresh cookie and no rotation can set a new
    // one afterwards. `requestLogout` does not take the lock again.
    mutationFn: ({ initialSessionGeneration }: LogoutVariables) =>
      withRefreshLock(async () => {
        // A login in any tab since this logout started has replaced the
        // refresh cookie, and this attempt would blacklist the new one. The
        // skipped attempt resolves, so it is not retried, and the logout is
        // over: the login already removed its pending flag, and only a flag
        // stored at this logout's generation is removed here.
        if (getSessionGeneration() !== initialSessionGeneration) {
          clearPendingLogout(initialSessionGeneration);
          return;
        }
        // Same check for this tab only, kept for when localStorage is
        // unavailable and the generation cannot change.
        if (queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)) return;
        await requestLogout();
        // Only a 2xx gets here: the cookie is blacklisted and cleared.
        clearPendingLogout(initialSessionGeneration);
      }),
    retry: LOGOUT_RETRIES,
    retryDelay: 0,
    // Mutation-level callback: it still runs after the layout that owns
    // `useLogout` unmounts. The local session is already gone and is not
    // restored. If every attempt fails (for example offline for the whole
    // retry window), the refresh cookie survives on the server until it
    // expires; the pending logout flag stays set, so the next load sends the
    // logout again instead of restoring the session.
    onError(error) {
      console.error("Logout request failed after retries.", error);
    },
  });
}

/** Query clients (one per app load) with a resumed logout in flight. */
const resumingLogout = new WeakSet<QueryClient>();

/**
 * Sends a logout that a previous load started but never completed, in the
 * background. It runs the same mutation as `useLogout` (lock, timeout,
 * retries and generation check) with the generation the flag captured, so a
 * login in any tab since then cancels it.
 */
function resumePendingLogout(
  queryClient: QueryClient,
  initialSessionGeneration: number,
): void {
  if (resumingLogout.has(queryClient)) return;
  resumingLogout.add(queryClient);
  new MutationObserver(queryClient, logoutMutationOptions(queryClient))
    .mutate({ initialSessionGeneration })
    // A final failure is already logged by the mutation's `onError`.
    .catch(() => undefined)
    .finally(() => resumingLogout.delete(queryClient));
}

/**
 * Handles a pending logout before the boot refresh. Returns `true` when the
 * boot must not refresh: the session for this load is "no session" and the
 * logout request is resent in the background.
 *
 * Not a security control: it only stops this app from restoring a session
 * that a failed logout left behind. The cookie itself stays valid until a
 * logout reaches the API, and anyone who can clear localStorage or call the
 * refresh endpoint can still use it.
 */
function handlePendingLogout(queryClient: QueryClient): boolean {
  const state = queryClient.getQueryState<AccessToken>(ACCESS_TOKEN_QUERY_KEY);
  // Only when the next call would start a refresh: a stored token or
  // "no session", or a refresh already in flight, are left to the cache.
  if (state?.data !== undefined || state?.fetchStatus === "fetching") {
    return false;
  }
  const pendingGeneration = getPendingLogout();
  if (pendingGeneration === null) return false;
  if (pendingGeneration !== getSessionGeneration()) {
    // A login since that logout replaced the cookie it targeted (and should
    // have removed the flag): the flag is stale and the boot refresh runs.
    clearPendingLogout(pendingGeneration);
    return false;
  }
  // "No session" is stored like a 401 from the boot refresh would be, so the
  // guards redirect to login and later calls do not refresh either.
  queryClient.setQueryData<AccessToken>(ACCESS_TOKEN_QUERY_KEY, null);
  resumePendingLogout(queryClient, pendingGeneration);
  return true;
}

export function accessTokenQueryOptions(queryClient: QueryClient) {
  return queryOptions({
    queryKey: ACCESS_TOKEN_QUERY_KEY,
    queryFn: () => refreshAccessToken(queryClient),
    staleTime: 4 * 60 * 1000, // 1 min less than the actual token expiration
    retry: false,
  });
}

/**
 * Resolves the current access token, running the boot refresh the first time
 * it is called. Later calls reuse the cached result (including "no session")
 * until login, logout or a refresh replaces it.
 *
 * With a pending logout flag (a logout whose request never succeeded), it
 * does not refresh: it resolves to "no session" right away and resends the
 * logout in the background.
 */
export async function ensureSession(
  queryClient: QueryClient,
): Promise<AccessToken> {
  if (handlePendingLogout(queryClient)) return null;
  try {
    return await queryClient.ensureQueryData(
      accessTokenQueryOptions(queryClient),
    );
  } catch {
    return null;
  }
}

/** Route guard: waits for the session and redirects to login without one. */
export async function requireSession(
  queryClient: QueryClient,
  redirectTo: string,
): Promise<void> {
  const token = await ensureSession(queryClient);
  if (!token) {
    throw redirect({
      to: "/",
      search: {
        // Use the current location to power a redirect after login
        // (Do not use `router.state.resolvedLocation` as it can
        // potentially lag behind the actual current location)
        redirect: redirectTo,
      },
    });
  }
}
