import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from "@mui/material";
import { AddBusinessOutlined, ArrowBackOutlined } from "@mui/icons-material";
import { Link as RouterLink } from "@tanstack/react-router";
import {
  useBusiness,
  type Business,
  type BusinessType,
} from "#hooks/quickApi/useBusinesses";

interface BusinessDetailsProps {
  businessId: number | undefined;
}

interface DetailRow {
  label: string;
  value: string | number | null | undefined;
}

function businessTypeLabel(type: BusinessType): string {
  if (type === "RESELLER") return "Revendedor";
  if (type === "RE_RESELLER") return "Sub-revendedor";
  return "Loja";
}

function formatDocument(document: string): string {
  const digits = document.replace(/\D/g, "");

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5",
    );
  }

  return document;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  }

  return phone;
}

function displayValue(value: DetailRow["value"]): string {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return "-";
  }
  return String(value);
}

function getDetailRows(business: Business): DetailRow[] {
  return [
    { label: "ID", value: business.id },
    { label: "Tipo", value: businessTypeLabel(business.type) },
    { label: "Razão Social", value: business.name },
    { label: "Nome Fantasia", value: business.trade_name },
    { label: "Tipo de documento", value: business.document_type },
    { label: "CPF/CNPJ", value: formatDocument(business.document) },
    { label: "E-mail", value: business.email },
    { label: "Celular", value: formatPhone(business.phone) },
    { label: "Telefone fixo", value: formatPhone(business.landline) },
    { label: "Empresa responsável", value: business.parent },
  ];
}

export function BusinessDetails({ businessId }: BusinessDetailsProps) {
  const { data: business, isLoading, error } = useBusiness(businessId);

  return (
    <Box>
      <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 2 }}>
        <Link
          component={RouterLink}
          to="/business-list"
          underline="hover"
          color="inherit"
        >
          Estabelecimentos
        </Link>
        <Typography color="text.primary" aria-current="page">
          Detalhes
        </Typography>
      </Breadcrumbs>

      <Box
        sx={{
          display: "flex",
          alignItems: { xs: "flex-start", sm: "center" },
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: "bold" }}>
            Detalhes do estabelecimento
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Consulte os dados cadastrais do estabelecimento selecionado
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {business?.type === "STORE" ? (
            <Button
              href={`/business-list/${business.id}/credenciamento-own`}
              variant="contained"
              startIcon={<AddBusinessOutlined />}
            >
              Credenciar na OWN
            </Button>
          ) : null}
          <Button
            component={RouterLink}
            to="/business-list"
            variant="outlined"
            startIcon={<ArrowBackOutlined />}
          >
            Voltar
          </Button>
        </Box>
      </Box>

      {businessId === undefined ? (
        <Alert severity="error">
          Identificador de estabelecimento inválido.
        </Alert>
      ) : error ? (
        <Alert severity="error">
          {error instanceof Error
            ? error.message
            : "Erro ao carregar o estabelecimento."}
        </Alert>
      ) : isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : business ? (
        <TableContainer component={Paper} variant="outlined">
          <Table aria-label="Detalhes do estabelecimento">
            <TableBody>
              {getDetailRows(business).map((row) => (
                <TableRow key={row.label}>
                  <TableCell
                    component="th"
                    scope="row"
                    sx={{ width: { xs: "45%", sm: 240 }, fontWeight: "bold" }}
                  >
                    {row.label}
                  </TableCell>
                  <TableCell>{displayValue(row.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}
    </Box>
  );
}
