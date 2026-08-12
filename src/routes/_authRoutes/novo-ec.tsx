import { createFileRoute } from "@tanstack/react-router";
import { NewBusiness } from "../../features/business/new-business/new-business-page";
import { NonStoreBusinessGuard } from "../../layout/non-store-business-guard";

export const Route = createFileRoute("/_authRoutes/novo-ec")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <NonStoreBusinessGuard>
      <NewBusiness />
    </NonStoreBusinessGuard>
  );
}
