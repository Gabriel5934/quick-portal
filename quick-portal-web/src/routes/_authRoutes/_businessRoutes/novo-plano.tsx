import { createFileRoute } from "@tanstack/react-router";
import { NewPlan } from "../../../features/plans";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/novo-plano")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AdminBusinessGuard>
      <NewPlan />
    </AdminBusinessGuard>
  );
}
