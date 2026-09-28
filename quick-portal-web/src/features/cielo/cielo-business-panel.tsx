import AddBusinessOutlined from "@mui/icons-material/AddBusinessOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { createLink } from "@tanstack/react-router";
import { useCieloBusiness } from "#hooks/quickApi/useCielo";

const RouterButton = createLink(Button);

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

export function CieloBusinessPanel({ businessId }: { businessId: number }) {
  const { data: seller, isLoading, error } = useCieloBusiness(businessId);

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

  const rows = [
    { label: "Merchant ID", value: seller.merchant_id },
    {
      label: "Último envio",
      value: seller.last_submitted_at
        ? formatDate(seller.last_submitted_at)
        : null,
    },
  ];

  return (
    <TableContainer>
      <Table aria-label="Dados Cielo do estabelecimento">
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label}>
              <TableCell
                component="th"
                scope="row"
                sx={{ width: { xs: "45%", sm: 260 }, fontWeight: "bold" }}
              >
                {row.label}
              </TableCell>
              <TableCell>{row.value ?? "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
