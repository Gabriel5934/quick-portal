import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getSessionGeneration, setPendingLogout } from "#hooks/storage";
import {
  announceLogout,
  clearSessionState,
  discardPendingRefreshes,
  logoutMutationOptions,
} from "./session";

export { LOGOUT_RETRIES, LOGOUT_TIMEOUT_MS } from "./session";

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // The request, its lock, timeout, retries and generation check are shared
  // with the boot path that resumes a pending logout (`ensureSession`).
  const { mutate } = useMutation(logoutMutationOptions(queryClient));

  return async () => {
    // Read first: a login that completes from now on, in any tab, cancels
    // the logout request.
    const initialSessionGeneration = getSessionGeneration();
    // Before any state is cleared, so a logout interrupted from here on (a
    // crash, a closed tab, a request that never succeeds) still makes the
    // next load resend it instead of restoring the session. Removed once the
    // request gets a 2xx; not a security control (see `setPendingLogout`).
    setPendingLogout(initialSessionGeneration);
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
