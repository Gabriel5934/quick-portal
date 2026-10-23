import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AppLayout } from "../../layout/app";
import { BusinessSelectionProvider } from "../../layout/business-selection-provider";
import { SessionPending } from "../../layout/session-pending";
import { requireSession } from "#hooks/auth/session";
import { useToken } from "#hooks/auth/useToken";

export const Route = createFileRoute("/_authRoutes")({
  // Waits for the boot refresh (the access token lives only in memory, so a
  // reload has none) before deciding to redirect to the login page.
  beforeLoad: ({ context, location }) =>
    requireSession(context.queryClient, location.href),
  pendingComponent: SessionPending,
  component: RouteComponent,
});

function RouteComponent() {
  const { data: token } = useToken();

  // The session ended while the app was open (expired, revoked or logged
  // out in another tab).
  if (token === null) return <Navigate to="/" />;

  return (
    <BusinessSelectionProvider>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </BusinessSelectionProvider>
  );
}
