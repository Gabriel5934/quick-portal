import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  AUTH_REQUEST_HEADERS,
  announceLogout,
  clearSessionState,
  discardPendingRefreshes,
  withRefreshLock,
} from "./session";

async function requestLogout(): Promise<void> {
  // Blacklists the refresh cookie and clears it.
  await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/token/logout/`, {
    method: "POST",
    credentials: "include",
    headers: AUTH_REQUEST_HEADERS,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return async () => {
    // Any refresh of this tab that completes from now on is discarded.
    discardPendingRefreshes();
    try {
      // Waits for a refresh in flight in any tab, so the request carries the
      // latest refresh cookie and no rotation can set a new one afterwards.
      // `requestLogout` does not take the lock again.
      await withRefreshLock(requestLogout);
    } catch {
      // swallow errors — logout proceeds regardless
    } finally {
      clearSessionState(queryClient);
      announceLogout();
    }
    await navigate({ to: "/" });
  };
}
