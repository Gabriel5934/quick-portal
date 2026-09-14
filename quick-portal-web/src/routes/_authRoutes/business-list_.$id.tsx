import { createFileRoute } from "@tanstack/react-router";
import { BusinessDetails } from "../../features/business-list";
import { NonStoreBusinessGuard } from "../../layout/non-store-business-guard";

export const Route = createFileRoute("/_authRoutes/business-list_/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const parsedId = Number(id);
  const businessId =
    Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : undefined;

  return (
    <NonStoreBusinessGuard>
      <BusinessDetails businessId={businessId} />
    </NonStoreBusinessGuard>
  );
}
