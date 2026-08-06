import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CompleteBusiness } from "../../features/business/complete-business-page";
import { NonStoreBusinessGuard } from "../../layout/non-store-business-guard";

const searchSchema = z.object({
  id: z.number().optional(),
});

export const Route = createFileRoute("/_authRoutes/completar-ec")({
  validateSearch: searchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useSearch();
  return (
    <NonStoreBusinessGuard>
      <CompleteBusiness id={id} />
    </NonStoreBusinessGuard>
  );
}
