import Alert from "@mui/material/Alert";
import { createFileRoute } from "@tanstack/react-router";
import { CieloBusinessPage } from "../../../features/cielo";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";
import { useBusinessScope } from "../../../layout/business-context";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/credenciamento_/cielo")({
  component: RouteComponent,
});

function RouteComponent() {
  const { business } = useBusinessScope();

  return (
    <AdminBusinessGuard>
      {business ? (
        <CieloBusinessPage key={business.id} businessId={business.id} />
      ) : (
        <Alert severity="info">Selecione uma empresa.</Alert>
      )}
    </AdminBusinessGuard>
  );
}
