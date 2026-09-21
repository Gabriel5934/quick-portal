import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { useAllBusinesses } from "#hooks/quickApi/useBusinesses";
import { useOwnActivities } from "#hooks/quickApi/useOwnActivities";
import { useOwnPlans } from "#hooks/quickApi/useOwnPlans";
import { useBusinessScope } from "../../layout/business-context";
import { BASKETS } from "./catalog";

function formatCnae(value: number): string {
  const stringValue = String(value);
  const digits = stringValue.replace(/\D/g, "");
  return digits.length === 7
    ? `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5)}`
    : stringValue;
}

export function Plans() {
  const navigate = useNavigate();
  const { business } = useBusinessScope();
  const { data, isLoading, error } = useOwnPlans(business?.id);
  const { data: activities = [] } = useOwnActivities();
  const { data: businesses = [] } = useAllBusinesses();

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: { xs: "flex-start", sm: "center" },
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          gap: 2,
          mb: 4,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: "bold" }}>
            Planos e Taxas
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gerencie os planos comerciais e suas taxas
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          onClick={() => void navigate({ to: "/novo-plano" })}
          sx={{ whiteSpace: "nowrap" }}
        >
          Novo Plano
        </Button>
      </Box>

      <Paper variant="outlined">
        <Box
          sx={{
            px: 3,
            py: 2,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            gap: 1,
            alignItems: "baseline",
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
            Resultados
          </Typography>
          {data && (
            <Typography variant="body2" color="text.secondary">
              {data.length.toLocaleString("pt-BR")} registros encontrados
            </Typography>
          )}
        </Box>

        {error ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <Typography color="error">
              {error instanceof Error
                ? error.message
                : "Erro ao carregar planos."}
            </Typography>
          </Box>
        ) : isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nome</TableCell>
                  <TableCell>Atividade</TableCell>
                  <TableCell>Cesta</TableCell>
                  <TableCell>Empresa</TableCell>
                  <TableCell>Antecipação</TableCell>
                  <TableCell>Criado em</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.length ? (
                  data.map((plan) => (
                    <TableRow key={plan.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                          {plan.title}
                        </Typography>
                        {plan.description && (
                          <Typography variant="caption" color="text.secondary">
                            {plan.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {formatCnae(plan.activity)}
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          {activities.find((activity) => activity.cnae === plan.activity)?.description}
                        </Typography>
                      </TableCell>
                      <TableCell>{BASKETS.find((basket) => basket.id === plan.basketId)?.name ?? plan.basketId}</TableCell>
                      <TableCell>{businesses.find((item) => item.id === plan.owner_business)?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Chip
                          label={plan.anticipation_type === "Rotating" ? "Sim" : "Não"}
                          size="small"
                          color={plan.anticipation_type === "Rotating" ? "success" : "default"}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(plan.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                      <Typography color="text.secondary">
                        Nenhum plano cadastrado
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
}
