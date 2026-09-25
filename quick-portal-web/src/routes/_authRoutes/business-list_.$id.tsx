import { createFileRoute } from "@tanstack/react-router";
import { BusinessDetails } from "../../features/business-list";
import { NonStoreBusinessGuard } from "../../layout/non-store-business-guard";
import { z } from "zod";

const businessDetailsSearchSchema = z.object({
  tab: z.enum(["quick", "own", "cielo"]).optional().catch(undefined),
});

export const Route = createFileRoute("/_authRoutes/business-list_/$id")({
  component: RouteComponent,
  validateSearch: businessDetailsSearchSchema,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const parsedId = Number(id);
  const businessId =
    Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : undefined;
  const { tab } = Route.useSearch();

  return (
    <NonStoreBusinessGuard>
      <BusinessDetails
        key={tab ?? "quick"}
        businessId={businessId}
        selectedTab={tab}
      />
    </NonStoreBusinessGuard>
  );
}
