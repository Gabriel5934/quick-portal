import Alert from "@mui/material/Alert";
import { createFileRoute } from "@tanstack/react-router";
import { CieloPlanPage } from "../../features/cielo-plans";
import { NonStoreBusinessGuard } from "../../layout/non-store-business-guard";

export const Route = createFileRoute("/_authRoutes/planos-cielo_/$id")({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const parsedId = Number(id);
  const planId =
    Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : undefined;

  return (
    <NonStoreBusinessGuard>
      {planId === undefined ? (
        <Alert severity="error">Identificador de plano inválido.</Alert>
      ) : (
        <CieloPlanPage key={planId} planId={planId} />
      )}
    </NonStoreBusinessGuard>
  );
}
