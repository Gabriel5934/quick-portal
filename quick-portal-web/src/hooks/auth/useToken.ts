import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bumpSessionGeneration, setUserEmail } from "#hooks/storage";
import type { ValidationErrors } from "#hooks/types";
import { fetchWithTimeout } from "./fetchWithTimeout";
import {
  ACCESS_TOKEN_QUERY_KEY,
  AUTH_REQUEST_HEADERS,
  accessTokenQueryOptions,
  withRefreshLock,
} from "./session";

type LoginRequest = {
  email: string;
  password: string;
};

type LoginResponse = {
  access: string;
};

/**
 * A login that has not received and read its whole response in this time is
 * aborted. Login holds the refresh lock, so this bounds how long a stalled
 * login can block logouts and refreshes in every tab. It is longer than
 * `LOGOUT_TIMEOUT_MS` because login is not retried, so a premature abort fails
 * the user's attempt, and password hashing on a loaded server can be slow.
 */
export const LOGIN_TIMEOUT_MS = 15_000;

/**
 * Logs in while holding the refresh lock, so the new refresh cookie is set
 * only after any logout or refresh in flight in any tab has finished, and no
 * late logout response or retry can blacklist or clear it. Must not refresh or
 * log out itself: the lock is not reentrant.
 */
function fetchLogin(payload: LoginRequest): Promise<LoginResponse> {
  return withRefreshLock(() => requestLogin(payload));
}

async function requestLogin(payload: LoginRequest): Promise<LoginResponse> {
  // The refresh token comes back as an HttpOnly cookie, never in the body.
  // The timeout also covers reading the body, so a response whose body stalls
  // releases the lock too; a timeout rejects before the generation bump.
  const { res, data } = await fetchWithTimeout(
    `${import.meta.env.VITE_API_BASE_URL}/api/token/`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...AUTH_REQUEST_HEADERS },
      body: JSON.stringify(payload),
    },
    LOGIN_TIMEOUT_MS,
    async (res) => ({
      res,
      data: (await res.json().catch(() => null)) as
        | (Partial<LoginResponse> & { detail?: string })
        | null,
    }),
  );

  if (!res.ok) {
    const errors = data as ValidationErrors;
    const keys = Object.keys(errors);
    throw new Error(errors[keys[0]][0]);
  }

  // A successful response has set the new refresh cookie: tell every tab's
  // pending logout, before the lock is released, not to send it.
  bumpSessionGeneration();

  const access = data?.access;

  if (!access) {
    throw new Error("Invalid token response from server.");
  }

  return { access };
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fetchLogin,
    onSuccess(data, variables) {
      // Drop anything cached for a previous session before storing the token.
      queryClient.removeQueries();
      queryClient.setQueryData(ACCESS_TOKEN_QUERY_KEY, data.access);
      setUserEmail(variables.email);
    },
  });
}

/** The in-memory access token; `null` once the session is gone. */
export function useToken() {
  const queryClient = useQueryClient();
  return useQuery(accessTokenQueryOptions(queryClient));
}
