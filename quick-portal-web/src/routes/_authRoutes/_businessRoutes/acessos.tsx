import { createFileRoute } from "@tanstack/react-router";
import { AccessPage } from "../../../features/access";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/acessos")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AdminBusinessGuard>
      <AccessPage />
    </AdminBusinessGuard>
  );
}
