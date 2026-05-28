import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppLayout } from "../../layout/app";
import { getRefreshToken } from "../../hooks/auth/storage";
import { useToken } from "../../hooks/useToken";

export const Route = createFileRoute("/_authRoutes")({
  beforeLoad: async ({ location }) => {
    if (!getRefreshToken()) {
      throw redirect({
        to: "/",
        search: {
          // Use the current location to power a redirect after login
          // (Do not use `router.state.resolvedLocation` as it can
          // potentially lag behind the actual current location)
          redirect: location.href,
        },
      });
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  useToken();

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
