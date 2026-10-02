import ArchiveOutlined from "@mui/icons-material/ArchiveOutlined";
import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import UnarchiveOutlined from "@mui/icons-material/UnarchiveOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { createLink } from "@tanstack/react-router";
import {
  useCieloPlan,
  useSetCieloPlanArchived,
} from "#hooks/quickApi/useCieloPlans";
import { useBusinessScope } from "../../layout/business-context";
import { FormPage } from "../../layout/form-page";
import {
  CIELO_CARD_BRANDS,
  CIELO_RATE_ROWS,
  formatFixedFee,
  formatMdr,
  rateRowLabel,
} from "./rates";
import type { CieloPlan } from "./types";

const RouterButton = createLink(Button);

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

function RatesTable({ plan }: { plan: CieloPlan }) {
  function rateFor(brand: string, row: (typeof CIELO_RATE_ROWS)[number]) {
    return plan.rates.find(
      (rate) =>
        rate.card_brand === brand &&
        rate.method === row.method &&
        rate.installments === row.installments,
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label="Taxas do plano">
        <TableHead>
          <TableRow>
            <TableCell rowSpan={2}>Forma de pagamento</TableCell>
            {CIELO_CARD_BRANDS.map((brand) => (
              <TableCell key={brand} colSpan={2} align="center">
                {brand}
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            {CIELO_CARD_BRANDS.flatMap((brand) => [
              <TableCell key={`${brand}-mdr`} align="right">
                MDR
              </TableCell>,
              <TableCell key={`${brand}-fixed-fee`} align="right">
                Taxa fixa
              </TableCell>,
            ])}
          </TableRow>
        </TableHead>
        <TableBody>
          {CIELO_RATE_ROWS.map((row) => (
            <TableRow key={rateRowLabel(row)}>
              <TableCell component="th" scope="row">
                {rateRowLabel(row)}
              </TableCell>
              {CIELO_CARD_BRANDS.flatMap((brand) => {
                const rate = rateFor(brand, row);
                return [
                  <TableCell key={`${brand}-mdr`} align="right">
                    {rate ? formatMdr(rate.mdr) : "—"}
                  </TableCell>,
                  <TableCell key={`${brand}-fixed-fee`} align="right">
                    {rate ? formatFixedFee(rate.fixed_fee) : "—"}
                  </TableCell>,
                ];
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function CieloPlanPage({ planId }: { planId: number }) {
  const { business } = useBusinessScope();
  const { data: plan, error } = useCieloPlan(planId, business?.id);
  const setArchived = useSetCieloPlanArchived(business?.id);

  if (error) {
    return <Alert severity="error">{error.message}</Alert>;
  }
  if (plan === undefined) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress aria-label="Carregando plano Cielo" />
      </Box>
    );
  }
  if (plan === null) {
    return (
      <Alert severity="warning">
        Plano Cielo não encontrado para a empresa selecionada.
      </Alert>
    );
  }

  const isArchived = plan.archived_at !== null;

  return (
    <FormPage
      breadcrumbs={[{ to: "/planos-cielo", label: "Planos Cielo" }]}
      currentLabel={plan.name}
      title={plan.name}
      subtitle={plan.description || undefined}
    >
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}
      >
        <Chip
          label={isArchived ? "Arquivado" : "Ativo"}
          color={isArchived ? "default" : "success"}
          size="small"
        />
        <Typography variant="body2" color="text.secondary">
          Criado em {formatDateTime(plan.created_at)}
        </Typography>
        {plan.archived_at ? (
          <Typography variant="body2" color="text.secondary">
            Arquivado em {formatDateTime(plan.archived_at)}
          </Typography>
        ) : null}
        <Box sx={{ flexGrow: 1 }} />
        <RouterButton
          to="/planos-cielo/novo"
          search={{ copiar: plan.id }}
          variant="outlined"
          startIcon={<ContentCopyOutlined />}
        >
          Copiar
        </RouterButton>
        <Button
          variant="outlined"
          color={isArchived ? "primary" : "warning"}
          startIcon={isArchived ? <UnarchiveOutlined /> : <ArchiveOutlined />}
          loading={setArchived.isPending}
          onClick={() =>
            setArchived.mutate({ planId: plan.id, archived: !isArchived })
          }
        >
          {isArchived ? "Desarquivar" : "Arquivar"}
        </Button>
      </Stack>
      {setArchived.error ? (
        <Alert severity="error">{setArchived.error.message}</Alert>
      ) : null}
      <RatesTable plan={plan} />
    </FormPage>
  );
}
