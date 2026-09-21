import PercentIcon from "@mui/icons-material/Percent";
import {
  Alert,
  Box,
  FormControlLabel,
  Paper,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useBasketAnticipation } from "#hooks/quickApi/useBasketAnticipation";
import { useOwnFees, type OwnFee } from "#hooks/quickApi/useOwnFees";
import { FormPaper } from "../business/FormPaper";
import { NETWORKS, basketFees, defaultRows, feeKey, feeLabel, feePercent } from "./catalog";
import type { NewPlanFormValues } from "./schemas";

function MarkupInput({ name, label, placeholder }: {
  name: `markups.${string}` | `defaults.${string}`;
  label: string;
  placeholder?: string;
}) {
  const { control } = useFormContext<NewPlanFormValues>();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TextField
          {...field}
          value={field.value ?? ""}
          size="small"
          placeholder={placeholder}
          inputMode="decimal"
          slotProps={{ htmlInput: { "aria-label": label } }}
          sx={{ width: 125 }}
        />
      )}
    />
  );
}

function FeeTable({ rows, defaults, isDefault }: {
  rows: OwnFee[];
  defaults: Record<string, string>;
  isDefault: boolean;
}) {
  return (
    <TableContainer component={Paper} variant="outlined" sx={{ flexBasis: "100%" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Produto</TableCell>
            {!isDefault && <TableCell>Taxa OWN</TableCell>}
            {!isDefault && <TableCell>MDR mínimo</TableCell>}
            <TableCell>Acréscimo (%)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((fee) => (
            <TableRow key={fee.id}>
              <TableCell>
                {feeLabel(fee)}
                {!isDefault && <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>ID {fee.id}</Typography>}
              </TableCell>
              {!isDefault && <TableCell>{feePercent(fee.value)}</TableCell>}
              {!isDefault && <TableCell>{feePercent(fee.baseMdr)}</TableCell>}
              <TableCell>
                <MarkupInput
                  name={isDefault ? `defaults.${feeKey(fee)}` : `markups.${fee.id}`}
                  label={`Acréscimo ${isDefault ? "padrão" : fee.network ?? "outros"} ${feeLabel(fee)}${isDefault ? "" : ` ID ${fee.id}`}`}
                  placeholder={isDefault ? undefined : (defaults[feeKey(fee)] || undefined)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function Fees() {
  const { control, watch } = useFormContext<NewPlanFormValues>();
  const basketId = watch("basketId");
  const defaults = watch("defaults");
  const anticipationType = watch("anticipation_type");
  const [tab, setTab] = useState("default");
  const { data: catalog = [], isLoading, error } = useOwnFees();
  const anticipation = useBasketAnticipation(basketId);
  const fees = basketId ? basketFees(catalog, basketId) : [];
  const networkRows = fees.filter((fee) => fee.network !== null);
  const otherRows = fees.filter((fee) => fee.network === null);
  const rows = tab === "default"
    ? defaultRows(networkRows)
    : tab === "other"
      ? otherRows
      : networkRows.filter((fee) => fee.network === tab);

  return (
    <FormPaper title="Taxas" subtitle="Informe somente o acréscimo de cada produto OWN" Icon={PercentIcon}>
      {!basketId ? (
        <Alert severity="info" sx={{ flexBasis: "100%" }}>Selecione uma cesta para configurar as taxas.</Alert>
      ) : (
        <>
          <Controller
            name="anticipation_type"
            control={control}
            render={({ field: { value, onChange, ref } }) => (
              <FormControlLabel
                control={<Switch checked={value === "Rotating"} onChange={(_, checked) => onChange(checked ? "Rotating" : "None")} ref={ref} />}
                label="Antecipação automática"
                sx={{ flexBasis: "100%" }}
              />
            )}
          />
          <Typography variant="body2" color="text.secondary" sx={{ flexBasis: "100%" }}>
            {anticipation.isLoading
              ? "Carregando taxa de antecipação..."
              : anticipation.error
                ? "Não foi possível carregar a taxa de antecipação."
                : `Taxa de antecipação da cesta: ${feePercent(anticipation.data?.anticipation_fee ?? "")}${anticipationType === "None" ? " (não aplicada)" : ""}`}
          </Typography>
          {error ? (
            <Alert severity="error" sx={{ flexBasis: "100%" }}>Erro ao carregar taxas OWN.</Alert>
          ) : isLoading ? (
            <Typography sx={{ flexBasis: "100%" }}>Carregando taxas...</Typography>
          ) : fees.length === 0 ? (
            <Alert severity="error" sx={{ flexBasis: "100%" }}>
              Não foram encontradas taxas para esta cesta.
            </Alert>
          ) : (
            <>
              <Alert severity="info" sx={{ flexBasis: "100%" }}>
                Padrão preenche o mesmo produto nas bandeiras Visa, Mastercard e Elo. Valores específicos de uma bandeira substituem o padrão.
              </Alert>
              <Box sx={{ flexBasis: "100%" }}>
                <Tabs value={tab} onChange={(_, value: string) => setTab(value)} variant="scrollable" scrollButtons="auto">
                  <Tab value="default" label="Padrão" />
                  {NETWORKS.map((network) => <Tab key={network} value={network} label={network} />)}
                  {otherRows.length > 0 && <Tab value="other" label="Outros" />}
                </Tabs>
              </Box>
              <FeeTable rows={rows} defaults={defaults} isDefault={tab === "default"} />
            </>
          )}
        </>
      )}
    </FormPaper>
  );
}
