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
import { usePlans } from "#hooks/quickApi/usePlans";

export function Plans() {
  const navigate = useNavigate();
  const { data, isLoading, error } = usePlans();

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
          onClick={() => navigate({ to: "/novo-plano" })}
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
                  <TableCell>MCC</TableCell>
                  <TableCell>Split</TableCell>
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
                          {plan.name}
                        </Typography>
                        {plan.description && (
                          <Typography variant="caption" color="text.secondary">
                            {plan.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{plan.mcc.mcc}</TableCell>
                      <TableCell>
                        <Chip
                          label={plan.split ? "Sim" : "Não"}
                          size="small"
                          color={plan.split ? "success" : "default"}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={plan.anticipation ? "Sim" : "Não"}
                          size="small"
                          color={plan.anticipation ? "success" : "default"}
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
                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
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
