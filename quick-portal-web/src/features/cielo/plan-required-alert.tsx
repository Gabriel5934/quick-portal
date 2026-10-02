import Alert from "@mui/material/Alert";
import MuiLink from "@mui/material/Link";
import { createLink } from "@tanstack/react-router";
import type { Business } from "#hooks/quickApi/useBusinesses";

const RouterLink = createLink(MuiLink);

/** Explains that the selected business needs an active Cielo plan first. */
export function CieloPlanRequiredAlert({
  scopeBusiness,
}: {
  scopeBusiness: Business | null;
}) {
  const name = scopeBusiness
    ? scopeBusiness.trade_name || scopeBusiness.name
    : "A empresa selecionada";

  return (
    <Alert severity="info" sx={{ textAlign: "left" }}>
      {name} não tem planos Cielo ativos. Crie um plano antes de credenciar um
      estabelecimento na Cielo.{" "}
      <RouterLink to="/planos-cielo/novo">Criar plano Cielo</RouterLink>
    </Alert>
  );
}
