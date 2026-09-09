import { createFileRoute } from "@tanstack/react-router";
import { Plans } from "../../features/plans";
import { NonStoreBusinessGuard } from "../../layout/non-store-business-guard";

export const Route = createFileRoute("/_authRoutes/planos-e-taxas")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <NonStoreBusinessGuard>
      <Plans />
    </NonStoreBusinessGuard>
  );
}
