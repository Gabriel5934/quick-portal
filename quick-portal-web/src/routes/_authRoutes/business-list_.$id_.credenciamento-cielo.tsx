import Alert from "@mui/material/Alert";
import { createFileRoute } from "@tanstack/react-router";
import { CieloBusinessPage } from "../../features/cielo";

export const Route = createFileRoute(
  "/_authRoutes/business-list_/$id_/credenciamento-cielo",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { id } = Route.useParams();
  const parsedId = Number(id);
  const businessId =
    Number.isSafeInteger(parsedId) && parsedId > 0 ? parsedId : undefined;

  return businessId === undefined ? (
    <Alert severity="error">Identificador de estabelecimento inválido.</Alert>
  ) : (
    <CieloBusinessPage businessId={businessId} />
  );
}
