import { createFileRoute } from "@tanstack/react-router";
import { Plans } from "../../../features/plans";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/planos-e-taxas")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AdminBusinessGuard>
      <Plans />
    </AdminBusinessGuard>
  );
}
