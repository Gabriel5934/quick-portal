import { createFileRoute } from "@tanstack/react-router";
import { NewCieloPlanPage } from "../../features/cielo-plans";
import { NonStoreBusinessGuard } from "../../layout/non-store-business-guard";

export const Route = createFileRoute("/_authRoutes/planos-cielo_/novo")({
  validateSearch: (search: Record<string, unknown>): { copiar?: number } => {
    const copiar = Number(search.copiar);
    return Number.isSafeInteger(copiar) && copiar > 0 ? { copiar } : {};
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { copiar } = Route.useSearch();
  return (
    <NonStoreBusinessGuard>
      <NewCieloPlanPage copyFromId={copiar} />
    </NonStoreBusinessGuard>
  );
}
