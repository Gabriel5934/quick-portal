import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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

async function requestLogout(): Promise<void> {
  // Blacklists the refresh cookie and clears it. `keepalive` lets the request
  // finish after logout navigates away or the tab closes.
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/token/logout/`,
    {
      method: "POST",
      credentials: "include",
      headers: AUTH_REQUEST_HEADERS,
      keepalive: true,
    },
  );
  // Throwing makes the mutation retry: while the cookie is not blacklisted, a
  // reload can restore the session from it.
  if (!res.ok) throw new ApiError(res.status, "Failed to log out.");
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { mutate } = useMutation({
    // Every attempt waits for a refresh in flight in any tab, so the request
    // carries the latest refresh cookie and no rotation can set a new one
    // afterwards. `requestLogout` does not take the lock again.
    mutationFn: () =>
      withRefreshLock(async () => {
        // A retry after the user logged in again in this tab would blacklist
        // the new session's cookie, so it is skipped.
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
    // Any refresh of this tab that completes from now on is discarded.
    discardPendingRefreshes();
    // The session ends locally right away, whatever the API answers.
    clearSessionState(queryClient);
    announceLogout();
    const navigation = navigate({ to: "/" });
    // Not awaited: the UI never waits for the logout request or its retries.
    mutate();
    await navigation;
  };
}
