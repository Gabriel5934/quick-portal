import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getSessionGeneration } from "#hooks/storage";
import { ApiError } from "#hooks/types";
import {
  ACCESS_TOKEN_QUERY_KEY,
  AUTH_REQUEST_HEADERS,
  announceLogout,
  clearSessionState,
  discardPendingRefreshes,
  withRefreshLock,
} from "./session";

/** Retries after the first attempt, so up to 4 logout requests in total. */
export const LOGOUT_RETRIES = 3;

/**
 * An attempt that gets no answer in this time is aborted and retried. Each
 * attempt holds the refresh lock, so this also bounds how long a stuck logout
 * can delay a login or refresh in any tab.
 */
export const LOGOUT_TIMEOUT_MS = 10_000;

type LogoutVariables = {
  /** Session generation read when the logout started. */
  initialSessionGeneration: number;
};

async function requestLogout(): Promise<void> {
  // An AbortController with a timer instead of `AbortSignal.timeout`, whose
  // timer the test environment's fake timers cannot drive.
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(
      new DOMException("Logout request timed out.", "TimeoutError"),
    );
  }, LOGOUT_TIMEOUT_MS);
  try {
    // Blacklists the refresh cookie and clears it. `keepalive` lets the
    // request finish after logout navigates away or the tab closes.
    const res = await fetch(
      `${import.meta.env.VITE_API_BASE_URL}/api/token/logout/`,
      {
        method: "POST",
        credentials: "include",
        headers: AUTH_REQUEST_HEADERS,
        keepalive: true,
        signal: controller.signal,
      },
    );
    // Throwing makes the mutation retry: while the cookie is not blacklisted,
    // a reload can restore the session from it.
    if (!res.ok) throw new ApiError(res.status, "Failed to log out.");
  } finally {
    clearTimeout(timeout);
  }
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { mutate } = useMutation({
    // Every attempt waits for a login or refresh in flight in any tab, so the
    // request carries the latest refresh cookie and no rotation can set a new
    // one afterwards. `requestLogout` does not take the lock again.
    mutationFn: ({ initialSessionGeneration }: LogoutVariables) =>
      withRefreshLock(async () => {
        // A login in any tab since this logout started has replaced the
        // refresh cookie, and this attempt would blacklist the new one. The
        // skipped attempt resolves, so it is not retried.
        if (getSessionGeneration() !== initialSessionGeneration) return;
        // Same check for this tab only, kept for when localStorage is
        // unavailable and the generation cannot change.
        if (queryClient.getQueryData(ACCESS_TOKEN_QUERY_KEY)) return;
        await requestLogout();
      }),
    retry: LOGOUT_RETRIES,
    retryDelay: 0,
    // Mutation-level callback: it still runs after the layout that owns this
    // hook unmounts. The local session is already gone and is not restored.
    // If every attempt fails (for example offline for the whole retry
    // window), the refresh cookie survives until it expires.
    onError(error) {
      console.error("Logout request failed after retries.", error);
    },
  });

  return async () => {
    // Read first: a login that completes from now on, in any tab, cancels
    // the logout request.
    const initialSessionGeneration = getSessionGeneration();
    // Any refresh of this tab that completes from now on is discarded.
    discardPendingRefreshes();
    // The session ends locally right away, whatever the API answers.
    clearSessionState(queryClient);
    announceLogout();
    const navigation = navigate({ to: "/" });
    // Not awaited: the UI never waits for the logout request or its retries.
    mutate({ initialSessionGeneration });
    await navigation;
  };
}
