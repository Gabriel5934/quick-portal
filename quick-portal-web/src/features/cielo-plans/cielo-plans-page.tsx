import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import MuiLink from "@mui/material/Link";
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
import { useCieloPlans } from "#hooks/quickApi/useCieloPlans";
import { useBusinessScope } from "../../layout/business-context";
import type { CieloPlanSummary } from "./types";

const RouterButton = createLink(Button);
const RouterLink = createLink(MuiLink);

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

interface PlanTableProps {
  label: string;
  dateLabel: string;
  date: (plan: CieloPlanSummary) => string | null;
  emptyMessage: string;
  plans: CieloPlanSummary[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

function PlanTable({
  label,
  dateLabel,
  date,
  emptyMessage,
  plans,
  isLoading,
  error,
}: PlanTableProps) {
  if (error) {
    return (
      <Typography color="error" sx={{ textAlign: "center", py: 6 }}>
        {error.message}
      </Typography>
    );
  }
  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress aria-label={`Carregando ${label.toLowerCase()}`} />
      </Box>
    );
  }

  return (
    <TableContainer>
      <Table size="small" aria-label={label}>
        <TableHead>
          <TableRow>
            <TableCell>Nome</TableCell>
            <TableCell sx={{ width: 160 }}>{dateLabel}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {plans?.length ? (
            plans.map((plan) => {
              const value = date(plan);
              return (
                <TableRow key={plan.id} hover>
                  <TableCell>
                    <RouterLink
                      to="/planos-cielo/$id"
                      params={{ id: String(plan.id) }}
                      underline="hover"
                      sx={{ fontWeight: "bold" }}
                    >
                      {plan.name}
                    </RouterLink>
                    {plan.description ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block" }}
                      >
                        {plan.description}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>{value ? formatDate(value) : "—"}</TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={2} align="center" sx={{ py: 6 }}>
                <Typography color="text.secondary">{emptyMessage}</Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function CieloPlansPage() {
  const { business } = useBusinessScope();
  const active = useCieloPlans(business?.id);
  const archived = useCieloPlans(business?.id, { archived: true });

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          mb: 4,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: "bold" }}>
            Planos Cielo
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Taxas fixas e MDRs usados pelos sellers Cielo
            {business ? ` de ${business.trade_name || business.name}` : ""}
          </Typography>
        </Box>
        <RouterButton
          to="/planos-cielo/novo"
          variant="contained"
          size="large"
          sx={{ whiteSpace: "nowrap" }}
        >
          Novo plano
        </RouterButton>
      </Box>

      <Stack spacing={3}>
        <Paper variant="outlined">
          <Box
            sx={{ px: 3, py: 2, borderBottom: 1, borderColor: "divider" }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
              Planos ativos
            </Typography>
          </Box>
          <PlanTable
            label="Planos ativos"
            dateLabel="Criado em"
            date={(plan) => plan.created_at}
            emptyMessage="Nenhum plano ativo"
            plans={active.data}
            isLoading={active.isLoading}
            error={active.error}
          />
        </Paper>

        <Accordion
          variant="outlined"
          disableGutters
          slotProps={{ transition: { unmountOnExit: true } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
              Planos arquivados
              {archived.data ? ` (${archived.data.length})` : ""}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <PlanTable
              label="Planos arquivados"
              dateLabel="Arquivado em"
              date={(plan) => plan.archived_at}
              emptyMessage="Nenhum plano arquivado"
              plans={archived.data}
              isLoading={archived.isLoading}
              error={archived.error}
            />
          </AccordionDetails>
        </Accordion>
      </Stack>
    </Box>
  );
}
