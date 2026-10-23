import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "../features/auth";
import { ensureSession } from "#hooks/auth/session";
import { SessionPending } from "../layout/session-pending";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context, location }) => {
    if (await ensureSession(context.queryClient)) {
      throw redirect({
        to: "/sales",
        search: {
          // Use the current location to power a redirect after login
          // (Do not use `router.state.resolvedLocation` as it can
          // potentially lag behind the actual current location)
          redirect: location.href,
        },
      });
    }
  },
  pendingComponent: SessionPending,
  component: LoginPage,
});
