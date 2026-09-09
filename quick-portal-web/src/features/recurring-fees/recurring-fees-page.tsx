import AddIcon from "@mui/icons-material/Add";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { useBusinessScope } from "../../layout/business-context";
import { useRecurringFees } from "../../hooks/quickApi/useRecurringFees";

export function RecurringFeesPage() {
  const navigate = useNavigate();
  const { business } = useBusinessScope();
  const { data = [], isLoading, error } = useRecurringFees(business?.id);

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          gap: 2,
          mb: 4,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Taxas Recorrentes
          </Typography>
          <Typography color="text.secondary">
            Gerencie cobranças recorrentes das empresas vinculadas.
          </Typography>
        </Box>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          onClick={() => void navigate({ to: "/recurring-fees/new/details" })}
        >
          Nova taxa
        </Button>
      </Box>
      <Paper variant="outlined">
        {error ? (
          <Typography color="error" sx={{ p: 4, textAlign: "center" }}>
            {error.message}
          </Typography>
        ) : isLoading ? (
          <Box sx={{ p: 6, display: "flex", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nome</TableCell>
                  <TableCell>Modelo</TableCell>
                  <TableCell>Empresas</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Início</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.length ? (
                  data.map((fee) => (
                    <TableRow key={fee.id} hover>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600 }}>
                          {fee.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {fee.description}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {fee.pricing_mode === "FIXED" ? "Fixo" : "Por meta"}
                      </TableCell>
                      <TableCell>{fee.target_businesses.length}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={fee.active ? "Ativa" : "Inativa"}
                          color={fee.active ? "success" : "default"}
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(
                          `${fee.start_date}T00:00:00`,
                        ).toLocaleDateString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                      <Typography color="text.secondary">
                        Nenhuma taxa recorrente cadastrada.
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
