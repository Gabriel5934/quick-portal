import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { ApiError, unwrap, type ApiResult } from '@/lib/api-error';
import { refreshSessionFn } from '@/server/quick-api';

export const sessionQueryKey = ['auth', 'session'] as const;

// Refresh slightly before Quick API rejects the token.
const EXPIRY_MARGIN_MS = 30_000;

export const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre novamente.';

/**
 * The access token lives only here, in the TanStack Query cache. Its query
 * function exchanges the HttpOnly refresh cookie for a new token (and resolves
 * to `null` when there is no session). Refresh tokens rotate on every use, so
 * the query never refetches on its own: `getAccessToken` refreshes it on demand.
 */
export function sessionQueryOptions() {
  return queryOptions({
    queryKey: sessionQueryKey,
    queryFn: async () => unwrap(await refreshSessionFn()),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** A valid access token, refreshed when it is about to expire. */
export async function getAccessToken(queryClient: QueryClient): Promise<string> {
  let session = await queryClient.query(sessionQueryOptions());
  if (session && session.expiresAt - EXPIRY_MARGIN_MS <= Date.now()) {
    // Concurrent callers share this single refresh.
    session = await queryClient.query({ ...sessionQueryOptions(), staleTime: 0 });
  }
  if (!session) {
    throw new ApiError(SESSION_EXPIRED_MESSAGE, 401);
  }
  return session.accessToken;
}

/**
 * Runs an authenticated server function. A 401 from Quick API means the token
 * was revoked (e.g. refresh token reuse), so the session is dropped.
 */
export async function withAccessToken<T>(
  queryClient: QueryClient,
  call: (accessToken: string) => Promise<ApiResult<T>>
): Promise<T> {
  const accessToken = await getAccessToken(queryClient);
  const result = await call(accessToken);
  if (!result.ok && result.status === 401) {
    queryClient.setQueryData(sessionQueryKey, null);
  }
  return unwrap(result);
}

/** Drops everything cached for the signed-in user. */
export function clearUserData(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: ['auth', 'me'] });
  queryClient.removeQueries({ queryKey: ['cielo'] });
}
