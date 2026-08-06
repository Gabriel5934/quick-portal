import { useMemo } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useBusinessScope } from "../../layout/business-context";
import { generateSalesDashboard } from "./sales-data";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

interface MetricCardProps {
  label: string;
  value: number;
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <Paper variant="outlined" sx={{ height: "100%", p: 2.5 }}>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        {currencyFormatter.format(value)}
      </Typography>
    </Paper>
  );
}

export function Sales() {
  const theme = useTheme();
  const { business } = useBusinessScope();
  const businessName = business?.name ?? "Perfil sem nome";
  const dashboard = useMemo(
    () => generateSalesDashboard(businessName),
    [businessName],
  );
  const currentYear = new Date().getFullYear();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Typography component="h1" variant="h5" sx={{ fontWeight: "bold" }}>
        Vendas
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            label="Total em vendas no mês vigente"
            value={dashboard.currentMonthSales}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            label="Comissão total do dia"
            value={dashboard.todayCommission}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            label="Valor a receber do dia"
            value={dashboard.todayReceivable}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MetricCard
            label="Total em vendas do dia"
            value={dashboard.todaySales}
          />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
          Vendas em {currentYear}
        </Typography>
        <Box sx={{ width: "100%", height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={dashboard.yearlySales}
              margin={{ top: 8, right: 16, left: 16, bottom: 0 }}
            >
              <defs>
                <linearGradient id="salesColor" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={theme.palette.primary.main}
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="95%"
                    stopColor={theme.palette.primary.main}
                    stopOpacity={0.03}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis
                tickFormatter={(value: number) =>
                  compactCurrencyFormatter.format(value)
                }
                tickLine={false}
                axisLine={false}
                width={88}
              />
              <Tooltip
                formatter={(value) => [
                  currencyFormatter.format(Number(value)),
                  "Vendas",
                ]}
              />
              <Area
                type="monotone"
                dataKey="sales"
                name="Vendas"
                stroke={theme.palette.primary.main}
                strokeWidth={3}
                fill="url(#salesColor)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      </Paper>
    </Box>
  );
}
