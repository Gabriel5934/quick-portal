import { createFileRoute } from "@tanstack/react-router";
import { BusinessList } from "../../features/business-list";
import { NonStoreBusinessGuard } from "../../layout/non-store-business-guard";

export const Route = createFileRoute("/_authRoutes/business-list")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <NonStoreBusinessGuard>
      <BusinessList />
    </NonStoreBusinessGuard>
  );
}
