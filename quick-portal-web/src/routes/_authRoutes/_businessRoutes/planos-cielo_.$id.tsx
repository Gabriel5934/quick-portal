import Alert from "@mui/material/Alert";
import { createFileRoute } from "@tanstack/react-router";
import { CieloPlanPage } from "../../../features/cielo-plans";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/planos-cielo_/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const parsedId = Number(id);
  const planId =
    Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : undefined;

  return (
    <AdminBusinessGuard>
      {planId === undefined ? (
        <Alert severity="error">Identificador de plano inválido.</Alert>
      ) : (
        <CieloPlanPage key={planId} planId={planId} />
      )}
    </AdminBusinessGuard>
  );
}
