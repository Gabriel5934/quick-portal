import { createFileRoute } from "@tanstack/react-router";
import { AccreditationPage } from "../../../features/accreditation";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";
import { useBusinessScope } from "../../../layout/business-context";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/credenciamento")({
  component: RouteComponent,
});

function RouteComponent() {
  const { business } = useBusinessScope();

  return (
    <AdminBusinessGuard>
      <AccreditationPage key={business?.id} businessId={business?.id} />
    </AdminBusinessGuard>
  );
}
