import AddBusinessOutlined from "@mui/icons-material/AddBusinessOutlined";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createLink } from "@tanstack/react-router";
import {
  useCieloBusiness,
  useRetryCieloBusiness,
} from "#hooks/quickApi/useCielo";
import type { CieloSubmissionStatus } from "./types";

const RouterButton = createLink(Button);

function statusLabel(status: CieloSubmissionStatus): string {
  if (status === "PENDING") return "Pendente";
  if (status === "FAILED") return "Falha no envio";
  return "Intervenção necessária";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

export function CieloBusinessPanel({ businessId }: { businessId: number }) {
  const { data: seller, isLoading, error } = useCieloBusiness(businessId);
  const retry = useRetryCieloBusiness();

  if (error) {
    return (
      <Alert severity="error">
        {error instanceof Error
          ? error.message
          : "Erro ao carregar o credenciamento Cielo."}
      </Alert>
    );
  }
  if (isLoading || seller === undefined) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress aria-label="Carregando credenciamento Cielo" />
      </Box>
    );
  }
  if (!seller) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          py: { xs: 4, sm: 7 },
          px: 2,
        }}
      >
        <AddBusinessOutlined color="disabled" sx={{ fontSize: 56, mb: 2 }} />
        <Typography variant="h6" sx={{ mb: 1 }}>
          Estabelecimento não credenciado na Cielo
        </Typography>
        <RouterButton
          to="/business-list/$id/credenciamento-cielo"
          params={{ id: String(businessId) }}
          variant="contained"
          startIcon={<AddBusinessOutlined />}
        >
          Credenciar
        </RouterButton>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {retry.error ? (
        <Alert severity="error">
          {retry.error instanceof Error
            ? retry.error.message
            : "Erro ao reenviar o credenciamento à Cielo."}
        </Alert>
      ) : null}
      <Typography>
        <strong>Status:</strong> {statusLabel(seller.status)}
      </Typography>
      {seller.merchant_id ? (
        <Typography>
          <strong>Merchant ID:</strong> {seller.merchant_id}
        </Typography>
      ) : null}
      {seller.last_submitted_at ? (
        <Typography>
          <strong>Último envio:</strong> {formatDate(seller.last_submitted_at)}
        </Typography>
      ) : null}
      {seller.status === "FAILED" &&
      seller.retry_available_at &&
      !seller.can_retry ? (
        <Alert severity="info">
          Nova tentativa disponível em {formatDate(seller.retry_available_at)}.
        </Alert>
      ) : null}
      {seller.status === "FAILED" ? (
        <Button
          variant="contained"
          startIcon={<RefreshOutlined />}
          disabled={!seller.can_retry || retry.isPending}
          loading={retry.isPending}
          onClick={() => retry.mutate({ businessId })}
          sx={{ alignSelf: "flex-start" }}
        >
          Tentar novamente
        </Button>
      ) : null}
    </Stack>
  );
}
