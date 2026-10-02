import { createFileRoute } from "@tanstack/react-router";
import { CieloPlansPage } from "../../features/cielo-plans";
import { NonStoreBusinessGuard } from "../../layout/non-store-business-guard";

export const Route = createFileRoute("/_authRoutes/planos-cielo")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <NonStoreBusinessGuard>
      <CieloPlansPage />
    </NonStoreBusinessGuard>
  );
}
