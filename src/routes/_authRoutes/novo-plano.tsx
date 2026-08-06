import { createFileRoute } from "@tanstack/react-router";
import { NewPlan } from "../../features/plans";
import { NonStoreBusinessGuard } from "../../layout/non-store-business-guard";

export const Route = createFileRoute("/_authRoutes/novo-plano")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <NonStoreBusinessGuard>
      <NewPlan />
    </NonStoreBusinessGuard>
  );
}
