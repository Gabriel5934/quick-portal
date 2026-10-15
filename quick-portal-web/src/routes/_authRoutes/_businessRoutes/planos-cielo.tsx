import { createFileRoute } from "@tanstack/react-router";
import { CieloPlansPage } from "../../../features/cielo-plans";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/planos-cielo")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AdminBusinessGuard>
      <CieloPlansPage />
    </AdminBusinessGuard>
  );
}
