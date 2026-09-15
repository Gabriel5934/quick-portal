import { createFileRoute } from "@tanstack/react-router";
import Alert from "@mui/material/Alert";
import { OwnBusiness } from "../../features/business/own-business/own-business-page";
import { NonStoreBusinessGuard } from "../../layout/non-store-business-guard";

export const Route = createFileRoute(
  "/_authRoutes/business-list_/$id_/credenciamento-own",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const parsedId = Number(id);
  const businessId =
    Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : undefined;

  return (
    <NonStoreBusinessGuard>
      {businessId === undefined ? (
        <Alert severity="error">
          Identificador de estabelecimento inválido.
        </Alert>
      ) : (
        <OwnBusiness businessId={businessId} />
      )}
    </NonStoreBusinessGuard>
  );
}
