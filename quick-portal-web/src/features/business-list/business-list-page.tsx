import { useMemo, useState } from "react";
import {
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Menu,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  StorefrontOutlined,
  CheckCircleOutlined,
  ErrorOutlineOutlined,
  AccessTimeOutlined,
  SyncOutlined,
  SearchOutlined,
  AddOutlined,
  ArrowDropDown,
} from "@mui/icons-material";
import { useNavigate } from "@tanstack/react-router";
import {
  useBusinesses,
  useBusinessSummary,
  useAllBusinesses,
  type BusinessType,
} from "#hooks/quickApi/useBusinesses";
import { useBusinessScope } from "../../layout/business-context";
import {
  useAcquirers,
  type AcquirerOption,
} from "#hooks/quickApi/useAcquirers";

interface CredentialButtonProps {
  businessId: number;
  acquirers: AcquirerOption[];
  loading: boolean;
}

function CredentialButton({
  businessId,
  acquirers,
  loading,
}: CredentialButtonProps) {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  function selectAcquirer(acquirerId: number) {
    setAnchorEl(null);
    void navigate({
      to: "/completar-ec",
      search: { id: businessId, acquirer: acquirerId },
    });
  }

  return (
    <>
      <ButtonGroup variant="outlined" size="small">
        <Button
          endIcon={<ArrowDropDown />}
          disabled={loading || acquirers.length === 0}
          aria-haspopup="menu"
          aria-expanded={anchorEl ? "true" : undefined}
          onClick={(event) => setAnchorEl(event.currentTarget)}
        >
          Credenciar
        </Button>
      </ButtonGroup>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem selected disabled>
          Credenciar
        </MenuItem>
        {acquirers.map((acquirer) => (
          <MenuItem
            key={acquirer.id}
            onClick={() => selectAcquirer(acquirer.id)}
          >
            {acquirer.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  color?: string;
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Box
          sx={{ color: color ?? "primary.main", fontSize: 36, display: "flex" }}
        >
          {icon}
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Typography
            variant="h5"
            sx={{ fontWeight: "bold" }}
            color={color ?? "text.primary"}
          >
            {value?.toLocaleString("pt-BR") ?? "—"}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
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
  return digits.length === 11
    ? digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
    : phone;
}

function displayValue(value: string | null | undefined): string {
  return value == null || value.trim() === "" ? "-" : value;
}

export function BusinessList() {
  const navigate = useNavigate();
  const { business } = useBusinessScope();
  const [document, setDocument] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [activeFilters, setActiveFilters] = useState<{
    document?: string;
    name?: string;
    trade_name?: string;
  }>({});
  const { data: hierarchy = [] } = useAllBusinesses();
  const { data: acquirers = [], isLoading: acquirersLoading } = useAcquirers();
  const businessesById = useMemo(
    () => new Map(hierarchy.map((item) => [item.id, item])),
    [hierarchy],
  );
  const showResellerColumn = business?.type === "RESELLER";

  const { data, isLoading, error } = useBusinesses({
    ...activeFilters,
    parent: business?.id,
    page: page + 1,
    page_size: rowsPerPage,
  });
  const { data: summary } = useBusinessSummary(business?.id);

  function handleSearch() {
    setPage(0);
    setActiveFilters({
      document: document.replace(/\D/g, "") || undefined,
      name: legalName || undefined,
      trade_name: tradeName || undefined,
    });
  }

  function handleClearFilters() {
    setDocument("");
    setLegalName("");
    setTradeName("");
    setPage(0);
    setActiveFilters({});
  }

  return (
    <Box>
      {/* Row 1 — header */}
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
            Estabelecimentos Cadastrados
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gerencie e consulte os ECs cadastrados no sistema
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          startIcon={<AddOutlined />}
          onClick={() => void navigate({ to: "/novo-ec" })}
          sx={{ whiteSpace: "nowrap" }}
        >
          Novo
        </Button>
      </Box>

      {/* Row 2 — stat cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, lg: "grow" }}>
          <StatCard
            icon={<StorefrontOutlined fontSize="inherit" />}
            label="Total de ECs"
            value={summary?.total}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: "grow" }}>
          <StatCard
            icon={<SyncOutlined fontSize="inherit" />}
            label="Não iniciados"
            value={summary?.not_started}
            color="info.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: "grow" }}>
          <StatCard
            icon={<CheckCircleOutlined fontSize="inherit" />}
            label="Concluídos"
            value={summary?.completed}
            color="success.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: "grow" }}>
          <StatCard
            icon={<AccessTimeOutlined fontSize="inherit" />}
            label="Pendentes"
            value={summary?.pending}
            color="warning.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: "grow" }}>
          <StatCard
            icon={<ErrorOutlineOutlined fontSize="inherit" />}
            label="Falhos"
            value={summary?.failed}
            color="error.main"
          />
        </Grid>
      </Grid>

      {/* Row 3 — filters */}
      <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
            Filtros de Busca
          </Typography>
          <Button size="small" onClick={handleClearFilters}>
            Limpar Filtros
          </Button>
        </Box>
        <Grid container spacing={2} sx={{ alignItems: "flex-end" }}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              label="CPF/CNPJ"
              placeholder="00.000.000/0000-00"
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              label="Nome / Razão Social"
              placeholder="Digite a razão social"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              label="Nome Fantasia"
              placeholder="Digite o nome fantasia"
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 1 }}>
            <Button
              variant="contained"
              onClick={handleSearch}
              fullWidth
              sx={{ height: 40, minWidth: 0 }}
            >
              <SearchOutlined />
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Row 4 — results table */}
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
              {data.count.toLocaleString("pt-BR")} registros encontrados
            </Typography>
          )}
        </Box>

        {error ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <Typography color="error">
              {error instanceof Error
                ? error.message
                : "Erro ao carregar estabelecimentos."}
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
                  <TableCell>CPF/CNPJ</TableCell>
                  <TableCell>Razão Social</TableCell>
                  <TableCell>Nome Fantasia</TableCell>
                  {showResellerColumn ? <TableCell>Revenda</TableCell> : null}
                  <TableCell>Tipo</TableCell>
                  <TableCell>E-mail</TableCell>
                  <TableCell>Telefone</TableCell>
                  <TableCell>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.results?.length ? (
                  data.results.map((biz) => {
                    const parent = biz.parent
                      ? businessesById.get(biz.parent)
                      : undefined;
                    const resellerName =
                      parent?.type === "RE_RESELLER"
                        ? parent.trade_name || parent.name
                        : null;

                    return (
                      <TableRow key={biz.id} hover>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: "bold" }}
                          >
                            {displayValue(formatDocument(biz.document))}
                          </Typography>
                        </TableCell>
                        <TableCell>{displayValue(biz.name)}</TableCell>
                        <TableCell>{displayValue(biz.trade_name)}</TableCell>
                        {showResellerColumn ? (
                          <TableCell sx={{ maxWidth: 180 }}>
                            {resellerName ? (
                              <Tooltip title={resellerName}>
                                <Typography variant="body2" noWrap>
                                  {resellerName}
                                </Typography>
                              </Tooltip>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                        ) : null}
                        <TableCell>{businessTypeLabel(biz.type)}</TableCell>
                        <TableCell>{displayValue(biz.email)}</TableCell>
                        <TableCell>
                          {displayValue(formatPhone(biz.phone))}
                        </TableCell>
                        <TableCell>
                          {biz.type === "STORE" && (
                            <CredentialButton
                              businessId={biz.id}
                              acquirers={acquirers}
                              loading={acquirersLoading}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={showResellerColumn ? 8 : 7}
                      align="center"
                      sx={{ py: 6 }}
                    >
                      <Typography color="text.secondary">
                        Nenhum registro encontrado
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
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage="Linhas por página"
          labelDisplayedRows={({ from, to, count }) =>
            `${from}–${to} de ${count.toLocaleString("pt-BR")}`
          }
        />
      </Paper>
    </Box>
  );
}
