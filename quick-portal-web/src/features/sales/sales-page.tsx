import { useState } from "react";
import {
  Box,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { useCieloTransactions } from "#hooks/quickApi/useCieloTransactions";
import { useBusinessScope } from "../../layout/business-context";

const COLUMNS = ["Data", "Valor", "Bandeira", "Tipo", "Adquirente", "Status"];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function formatCents(amount: number): string {
  return currencyFormatter.format(amount / 100);
}

function displayValue(value: string | null): string {
  return value == null || value.trim() === "" ? "—" : value;
}

export function Sales() {
  const { business } = useBusinessScope();
  // Remounting on a business change returns the table to its first page.
  return <SalesTable key={business?.id} business={business} />;
}

function SalesTable({ business }: { business: Business | null }) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const { data, isLoading, error } = useCieloTransactions(business?.id, {
    page: page + 1,
    pageSize: rowsPerPage,
  });

  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: "bold" }}>
          Vendas
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Transações Cielo de {business?.name ?? "—"}
        </Typography>
      </Box>

      <Paper variant="outlined">
        {error ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <Typography color="error">
              {error instanceof Error
                ? error.message
                : "Erro ao carregar as vendas."}
            </Typography>
          </Box>
        ) : isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress aria-label="Carregando vendas" />
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Vendas" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  {COLUMNS.map((column) => (
                    <TableCell
                      key={column}
                      align={column === "Valor" ? "right" : "left"}
                    >
                      {column}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.results.length ? (
                  data.results.map((transaction) => (
                    <TableRow key={transaction.id} hover>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {formatDate(transaction.received_date)}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        {formatCents(transaction.amount)}
                      </TableCell>
                      <TableCell>{displayValue(transaction.brand)}</TableCell>
                      <TableCell>{transaction.payment_type.label}</TableCell>
                      <TableCell>{displayValue(transaction.provider)}</TableCell>
                      <TableCell>{transaction.status.label}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={COLUMNS.length}
                      align="center"
                      sx={{ py: 6 }}
                    >
                      <Typography color="text.secondary">
                        Nenhuma venda encontrada
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <TablePagination
          component="div"
          count={data?.count ?? 0}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50, 100]}
          labelRowsPerPage="Linhas por página"
          labelDisplayedRows={({ from, to, count }) =>
            `${from}–${to} de ${count.toLocaleString("pt-BR")}`
          }
          getItemAriaLabel={(type) =>
            type === "next" ? "Próxima página" : "Página anterior"
          }
        />
      </Paper>
    </Box>
  );
}
