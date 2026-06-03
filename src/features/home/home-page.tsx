import { useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  StorefrontOutlined,
  CheckCircleOutlined,
  AccessTimeOutlined,
  SyncOutlined,
  SearchOutlined,
} from "@mui/icons-material";
import { useNavigate } from "@tanstack/react-router";
import { useBusinesses } from "#hooks/quickApi/useBusinesses";

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

function statusLabel(status: string): string {
  if (status === "NOT_STARTED") return "Pendente";
  if (status === "COMPLETED") return "Completo";
  return status;
}

function statusColor(status: string): string {
  if (status === "COMPLETED") return "success.main";
  if (status === "NOT_STARTED") return "warning.main";
  return "info.main";
}

export function Home() {
  const navigate = useNavigate();
  const [document, setDocument] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [activeFilters, setActiveFilters] = useState<{
    document?: string;
    legal_name?: string;
    trade_name?: string;
  }>({});

  const { data, isLoading, error } = useBusinesses({
    ...activeFilters,
    page: page + 1,
    page_size: rowsPerPage,
  });

  function handleSearch() {
    setPage(0);
    setActiveFilters({
      document: document || undefined,
      legal_name: legalName || undefined,
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
            Estabelecimentos Credenciados
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gerencie e consulte os ECs credenciados no sistema
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          onClick={() => navigate({ to: "/novo-ec" })}
          sx={{ whiteSpace: "nowrap" }}
        >
          Novo Credenciamento
        </Button>
      </Box>

      {/* Row 2 — stat cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            icon={<StorefrontOutlined fontSize="inherit" />}
            label="Total de ECs"
            value={data?.count}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            icon={<CheckCircleOutlined fontSize="inherit" />}
            label="Concluídos"
            value={data?.count_by_status["COMPLETED"]}
            color="success.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            icon={<AccessTimeOutlined fontSize="inherit" />}
            label="Pendentes"
            value={data?.count_by_status["NOT_STARTED"]}
            color="warning.main"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <StatCard
            icon={<SyncOutlined fontSize="inherit" />}
            label="Em Validação"
            value={data?.count_by_status["IN_VALIDATION"]}
            color="info.main"
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
                  <TableCell>Status</TableCell>
                  <TableCell>E-mail</TableCell>
                  <TableCell>Telefone</TableCell>
                  <TableCell>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.results?.length ? (
                  data.results.map((biz) => (
                    <TableRow key={biz.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                          {biz.document}
                        </Typography>
                      </TableCell>
                      <TableCell>{biz.legal_name}</TableCell>
                      <TableCell>{biz.trade_name}</TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          color={statusColor(biz.own_status)}
                          sx={{ fontWeight: 500 }}
                        >
                          {statusLabel(biz.own_status)}
                        </Typography>
                      </TableCell>
                      <TableCell>{biz.email}</TableCell>
                      <TableCell>{biz.phone_number}</TableCell>
                      <TableCell>
                        {biz.own_status === "NOT_STARTED" && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() =>
                              navigate({
                                to: "/completar-ec",
                                search: { id: biz.id },
                              })
                            }
                          >
                            Completar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
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
