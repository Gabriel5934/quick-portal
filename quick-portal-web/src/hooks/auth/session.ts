import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { clearUserEmail } from "#hooks/storage";
import { ApiError } from "#hooks/types";

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
 */
export async function ensureSession(
  queryClient: QueryClient,
): Promise<AccessToken> {
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
