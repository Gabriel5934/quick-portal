import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Link,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import {
  AddBusinessOutlined,
  ArrowBackOutlined,
  Circle,
  HourglassEmptyOutlined,
  StorefrontOutlined,
} from "@mui/icons-material";
import { createLink, Link as RouterLink } from "@tanstack/react-router";
import { useState, type ReactNode, type SyntheticEvent } from "react";
import {
  useBusiness,
  type Business,
  type BusinessType,
} from "#hooks/quickApi/useBusinesses";
import {
  useOwnBusinessForBusiness,
  type OwnBusinessDetails,
  type OwnRegistrationStatus,
} from "#hooks/quickApi/useOwnBusinesses";

interface BusinessDetailsProps {
  businessId: number | undefined;
}

interface DetailRow {
  label: string;
  value: ReactNode;
}

interface TabPanelProps {
  children: ReactNode;
  index: number;
  value: number;
}

const RouterButton = createLink(Button);

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

function displayValue(value: DetailRow["value"]): ReactNode {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return "-";
  }
  return value;
}

function formatPostalCode(postalCode: string): string {
  const digits = postalCode.replace(/\D/g, "");
  return digits.length === 8
    ? digits.replace(/(\d{5})(\d{3})/, "$1-$2")
    : postalCode;
}

function formatCurrency(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : value;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function ownStatusLabel(status: OwnRegistrationStatus): string {
  if (status === "REGISTERED") return "Credenciado";
  if (status === "PENDING") return "Pendente";
  if (status === "API_REQUEST_FAILED") return "Falha no credenciamento";
  return "Status desconhecido";
}

function OwnStatusCard({
  businessId,
  ownBusiness,
}: {
  businessId: number;
  ownBusiness: OwnBusinessDetails | null;
}) {
  const status = ownBusiness?.registration_status;
  const label =
    status === "API_REQUEST_FAILED"
      ? "ERRO NO CADASTRO"
      : status === "REGISTERED"
        ? "CREDENCIADO"
        : status === "PENDING"
          ? "PENDENTE"
          : status === "UNKNOWN"
            ? "VERIFICAÇÃO NECESSÁRIA"
            : "NÃO CREDENCIADO";
  const color =
    status === "API_REQUEST_FAILED"
      ? "error.main"
      : status === "REGISTERED"
        ? "success.main"
        : status === "PENDING" || status === "UNKNOWN"
          ? "warning.main"
          : "text.disabled";

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mb: 2,
        display: "flex",
        alignItems: { xs: "flex-start", sm: "center" },
        flexDirection: { xs: "column", sm: "row" },
        justifyContent: "space-between",
        gap: 1,
      }}
    >
      <Typography variant="body2">OWN</Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Circle aria-hidden sx={{ fontSize: 16, color }} />
        <Typography variant="body2" role="status">
          {label}
        </Typography>
        {status === "API_REQUEST_FAILED" && (
          <RouterButton
            to="/business-list/$id/credenciamento-own"
            params={{ id: String(businessId) }}
            variant="contained"
            color="inherit"
            size="small"
            sx={{ ml: 1 }}
          >
            Revisar
          </RouterButton>
        )}
      </Box>
    </Paper>
  );
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

function getOwnDetailRows(ownBusiness: OwnBusinessDetails): DetailRow[] {
  const address = [
    `${ownBusiness.street}, ${ownBusiness.address_number}`,
    ownBusiness.address_complement,
    ownBusiness.neighborhood,
    `${ownBusiness.city} - ${ownBusiness.state}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    { label: "ID OWN", value: ownBusiness.id },
    {
      label: "Status do credenciamento",
      value: ownStatusLabel(ownBusiness.registration_status),
    },
    { label: "Erro do credenciamento", value: ownBusiness.registration_error },
    { label: "CNAE", value: ownBusiness.cnae },
    { label: "Plano", value: ownBusiness.plan },
    { label: "Responsável pela assinatura", value: ownBusiness.signatory_name },
    {
      label: "CPF do responsável",
      value: formatDocument(ownBusiness.signatory_cpf),
    },
    { label: "E-mail do responsável", value: ownBusiness.signatory_email },
    {
      label: "Faturamento previsto",
      value: formatCurrency(ownBusiness.forecast_revenue),
    },
    {
      label: "Faturamento contratado",
      value: formatCurrency(ownBusiness.contract_revenue),
    },
    { label: "CEP", value: formatPostalCode(ownBusiness.postal_code) },
    { label: "Endereço", value: address },
    { label: "Quantidade de POS", value: ownBusiness.pos_quantity },
    { label: "Banco", value: ownBusiness.bank_code },
    {
      label: "Agência",
      value: `${ownBusiness.bank_branch}-${ownBusiness.bank_branch_digit}`,
    },
    {
      label: "Conta",
      value: `${ownBusiness.bank_account}-${ownBusiness.bank_account_digit}`,
    },
    { label: "Protocolo Core", value: ownBusiness.core_protocol },
    { label: "Número do contrato", value: ownBusiness.contract_number },
    { label: "Criado em", value: formatDate(ownBusiness.created_at) },
    { label: "Atualizado em", value: formatDate(ownBusiness.updated_at) },
  ];
}

function tabA11yProps(index: number) {
  return {
    id: `business-details-tab-${index}`,
    "aria-controls": `business-details-tabpanel-${index}`,
  };
}

function TabPanel({ children, index, value }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      tabIndex={0}
      id={`business-details-tabpanel-${index}`}
      aria-labelledby={`business-details-tab-${index}`}
      sx={{ p: { xs: 2, sm: 3 } }}
    >
      {value === index ? children : null}
    </Box>
  );
}

function DetailsTable({
  ariaLabel,
  rows,
}: {
  ariaLabel: string;
  rows: DetailRow[];
}) {
  return (
    <TableContainer>
      <Table aria-label={ariaLabel}>
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
              <TableCell>{displayValue(row.value)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function BusinessDetails({ businessId }: BusinessDetailsProps) {
  const [activeTab, setActiveTab] = useState(0);
  const { data: business, isLoading, error } = useBusiness(businessId);
  const {
    data: ownBusiness,
    isLoading: isOwnBusinessLoading,
    error: ownBusinessError,
  } = useOwnBusinessForBusiness(businessId);

  function handleTabChange(_: SyntheticEvent, nextTab: number) {
    setActiveTab(nextTab);
  }

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
        <Button
          component={RouterLink}
          to="/business-list"
          variant="outlined"
          startIcon={<ArrowBackOutlined />}
        >
          Voltar
        </Button>
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
        <>
          {ownBusinessError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {ownBusinessError instanceof Error
                ? ownBusinessError.message
                : "Erro ao carregar o credenciamento OWN."}
            </Alert>
          ) : isOwnBusinessLoading || ownBusiness === undefined ? (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <CircularProgress
                size={20}
                aria-label="Carregando status do credenciamento OWN"
              />
            </Paper>
          ) : (
            <OwnStatusCard businessId={business.id} ownBusiness={ownBusiness} />
          )}
          <Paper variant="outlined">
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
              aria-label="Dados do estabelecimento por adquirente"
              sx={{ borderBottom: 1, borderColor: "divider" }}
            >
              <Tab label="Quick" {...tabA11yProps(0)} />
              <Tab label="OWN" {...tabA11yProps(1)} />
              <Tab label="Cielo" {...tabA11yProps(2)} />
            </Tabs>

            <TabPanel value={activeTab} index={0}>
              <DetailsTable
                ariaLabel="Dados Quick do estabelecimento"
                rows={getDetailRows(business)}
              />
            </TabPanel>

            <TabPanel value={activeTab} index={1}>
              {ownBusinessError ? (
                <Alert severity="error">
                  {ownBusinessError instanceof Error
                    ? ownBusinessError.message
                    : "Erro ao carregar o credenciamento OWN."}
                </Alert>
              ) : isOwnBusinessLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                  <CircularProgress />
                </Box>
              ) : ownBusiness ? (
                <DetailsTable
                  ariaLabel="Dados OWN do estabelecimento"
                  rows={getOwnDetailRows(ownBusiness)}
                />
              ) : (
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
                  <StorefrontOutlined
                    color="disabled"
                    sx={{ fontSize: 56, mb: 2 }}
                  />
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    Estabelecimento não credenciado na OWN
                  </Typography>
                  <RouterButton
                    to="/business-list/$id/credenciamento-own"
                    params={{ id: String(business.id) }}
                    variant="contained"
                    startIcon={<AddBusinessOutlined />}
                  >
                    Credenciar
                  </RouterButton>
                </Box>
              )}
            </TabPanel>

            <TabPanel value={activeTab} index={2}>
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
                <HourglassEmptyOutlined
                  color="disabled"
                  sx={{ fontSize: 56, mb: 2 }}
                />
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Cielo ainda não está disponível
                </Typography>
                <Typography color="text.secondary">
                  Os dados de credenciamento da Cielo estarão disponíveis em
                  breve.
                </Typography>
              </Box>
            </TabPanel>
          </Paper>
        </>
      ) : null}
    </Box>
  );
}
