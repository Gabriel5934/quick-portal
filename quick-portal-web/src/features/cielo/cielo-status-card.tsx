import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { StatusBadge, StatusCard } from "../../components/status-card";
import {
  useCieloBusiness,
  useRetryCieloBusiness,
} from "#hooks/quickApi/useCielo";
import {
  bankAccountBadge,
  kycBadge,
  onboardingBadge,
  submissionBadge,
} from "./status";
import type { CieloBusinessSummary } from "./types";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function lastUpdatedAt(seller: CieloBusinessSummary): string | null {
  const timestamps = [
    seller.last_submitted_at,
    seller.kyc_status_updated_at,
    seller.bank_account_status_updated_at,
    seller.onboarding_status_updated_at,
  ].filter((value): value is string => value !== null);
  if (timestamps.length === 0) return null;
  return timestamps.reduce((latest, value) =>
    new Date(value).getTime() > new Date(latest).getTime() ? value : latest,
  );
}

function RetryAction({
  businessId,
  seller,
}: {
  businessId: number;
  seller: CieloBusinessSummary;
}) {
  const retry = useRetryCieloBusiness();
  const coolingDown = !seller.can_retry;
  const button = (
    <Button
      variant="contained"
      size="small"
      startIcon={<RefreshOutlined />}
      disabled={coolingDown || retry.isPending}
      loading={retry.isPending}
      onClick={() => retry.mutate({ businessId })}
    >
      Tentar novamente
    </Button>
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {coolingDown && seller.retry_available_at ? (
        <Tooltip
          describeChild
          title={`Nova tentativa disponível em ${formatDate(seller.retry_available_at)}`}
        >
          <Box component="span" tabIndex={0} sx={{ display: "inline-flex" }}>
            {button}
          </Box>
        </Tooltip>
      ) : (
        button
      )}
      {retry.error ? (
        <Typography variant="caption" color="error" role="alert">
          {retry.error instanceof Error
            ? retry.error.message
            : "Erro ao reenviar o credenciamento à Cielo."}
        </Typography>
      ) : null}
    </Box>
  );
}

export function CieloStatusCard({ businessId }: { businessId: number }) {
  const { data: seller, isLoading, error } = useCieloBusiness(businessId);

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error instanceof Error
          ? error.message
          : "Erro ao carregar o credenciamento Cielo."}
      </Alert>
    );
  }
  if (isLoading || seller === undefined) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <CircularProgress
          size={20}
          aria-label="Carregando status do credenciamento Cielo"
        />
      </Paper>
    );
  }
  if (!seller) {
    return (
      <StatusCard title="Cielo">
        <StatusBadge
          caption="Credenciamento"
          label="Não credenciado"
          tone="neutral"
        />
      </StatusCard>
    );
  }

  const updatedAt = lastUpdatedAt(seller);

  return (
    <StatusCard
      title="Cielo"
      subtitle={
        updatedAt ? `Última atualização: ${formatDate(updatedAt)}` : undefined
      }
    >
      {seller.status === "FAILED" ? (
        <RetryAction businessId={businessId} seller={seller} />
      ) : null}
      <StatusBadge caption="Quick" {...submissionBadge(seller.status)} />
      <Divider orientation="vertical" flexItem />
      <StatusBadge
        caption="Credenciamento"
        {...onboardingBadge(seller.onboarding_status)}
      />
      <StatusBadge
        caption="Bancário"
        {...bankAccountBadge(seller.bank_account_status)}
      />
      <StatusBadge caption="KYC" {...kycBadge(seller.kyc_status)} />
    </StatusCard>
  );
}
