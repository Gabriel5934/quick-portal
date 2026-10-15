import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import { useCieloBusiness } from "#hooks/quickApi/useCielo";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

/** Shows the Cielo seller's details; renders nothing until it is signed up.
 * Loading and errors are reported by ``CieloStatusCard``. */
export function CieloBusinessPanel({ businessId }: { businessId: number }) {
  const { data: seller } = useCieloBusiness(businessId);

  if (!seller) return null;

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
    <TableContainer component={Paper} variant="outlined">
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
