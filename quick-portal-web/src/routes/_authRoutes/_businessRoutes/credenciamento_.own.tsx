import { createFileRoute } from "@tanstack/react-router";
import Alert from "@mui/material/Alert";
import { OwnBusiness } from "../../../features/business/own-business/own-business-page";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";
import { useBusinessScope } from "../../../layout/business-context";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/credenciamento_/own")({
  component: RouteComponent,
});

function RouteComponent() {
  const { business } = useBusinessScope();

  return (
    <AdminBusinessGuard>
      {business ? (
        <OwnBusiness key={business.id} businessId={business.id} />
      ) : (
        <Alert severity="info">Selecione uma empresa.</Alert>
      )}
    </AdminBusinessGuard>
  );
}
