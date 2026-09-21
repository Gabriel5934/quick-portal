import { createFileRoute } from "@tanstack/react-router";
import { NewPlan } from "../../features/plans";
import { NonStoreBusinessGuard } from "../../layout/non-store-business-guard";

export const Route = createFileRoute("/_authRoutes/novo-plano")({
  validateSearch: (search: Record<string, unknown>): { business?: number } => {
    const business = Number(search.business);
    return Number.isInteger(business) && business > 0 ? { business } : {};
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { business } = Route.useSearch();
  return (
    <NonStoreBusinessGuard>
      <NewPlan ownerBusinessId={business} />
    </NonStoreBusinessGuard>
  );
}
