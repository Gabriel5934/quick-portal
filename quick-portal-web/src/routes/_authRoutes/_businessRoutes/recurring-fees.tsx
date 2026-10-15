import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/recurring-fees")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AdminBusinessGuard>
      <Outlet />
    </AdminBusinessGuard>
  );
}
