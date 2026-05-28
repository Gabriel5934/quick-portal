import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppLayout } from "../../layout/app";

export const Route = createFileRoute("/_authRoutes")({
  beforeLoad: async ({ location }) => {
    if (!localStorage.getItem("token")) {
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
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
