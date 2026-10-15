import { createFileRoute } from "@tanstack/react-router";
import { NewCieloPlanPage } from "../../../features/cielo-plans";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/planos-cielo_/novo")({
  validateSearch: (search: Record<string, unknown>): { copiar?: number } => {
    const copiar = Number(search.copiar);
    return Number.isSafeInteger(copiar) && copiar > 0 ? { copiar } : {};
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { copiar } = Route.useSearch();
  return (
    <AdminBusinessGuard>
      <NewCieloPlanPage copyFromId={copiar} />
    </AdminBusinessGuard>
  );
}
