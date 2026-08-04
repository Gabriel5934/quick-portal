import { useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import PercentIcon from "@mui/icons-material/Percent";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import type { FieldPath } from "react-hook-form";
import { useAcquirers } from "#hooks/quickApi/useAcquirers";
import { useCnaes } from "#hooks/quickApi/useCnaes";
import { useFees } from "#hooks/quickApi/useFees";
import { FormPaper } from "../business/FormPaper";
import { NETWORKS } from "./schemas";
import type { CardNetwork, Network, NewPlanFormValues } from "./schemas";

const FILL_MODES = ["manual", "six"] as const;
type FillMode = (typeof FILL_MODES)[number];

const NETWORK_COLOR: Record<Network, string> = {
  mastercard: "#f79e1a",
  visa: "#1b34cb",
  elo: "#0c3a34",
  pix: "#39b4aa",
};

const NETWORK_NAME: Record<Network, string> = {
  mastercard: "Mastercard",
  visa: "Visa",
  elo: "Elo",
  pix: "Pix",
};

const FILL_MODE_LABEL: Record<FillMode, string> = {
  manual: "Por parcela",
  six: "De 6 em 6",
};

function baseFeeAsPercent(value: string | null): number {
  if (value === null || value === undefined) return NaN;
  const n = Number(value);
  if (Number.isNaN(n)) return NaN;
  return n * 100;
}

function formatBaseFee(value: string | null): string {
  const n = baseFeeAsPercent(value);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

function parseNumber(value: string): number {
  if (value === "" || value === "-") return NaN;
  const n = Number(value.replace(",", "."));
  return n;
}

function formatPercent(value: number): string {
  if (Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function formatRange(values: number[]): string {
  const clean = values.filter((v) => !Number.isNaN(v));
  if (clean.length === 0) return "—";
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  if (min === max) return `${min.toFixed(2)}%`;
  return `${min.toFixed(2)}% – ${max.toFixed(2)}%`;
}

export function Fees() {
  const {
    control,
    register,
    unregister,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<NewPlanFormValues>();
  const acquirerId = watch("acquirerId");
  const cnae = watch("cnae");
  const anticipation = watch("anticipation");
  const anticipationFee = watch("anticipation_fee");
  const fees = watch("fees");

  const [network, setNetwork] = useState<Network>("mastercard");
  const [fillMode, setFillMode] = useState<FillMode>("manual");
  const mastercardInstallments = useFieldArray({
    control,
    name: "fees.mastercard.installments",
  });
  const visaInstallments = useFieldArray({
    control,
    name: "fees.visa.installments",
  });
  const eloInstallments = useFieldArray({
    control,
    name: "fees.elo.installments",
  });
  const installmentFields =
    network === "mastercard"
      ? mastercardInstallments.fields
      : network === "visa"
        ? visaInstallments.fields
        : eloInstallments.fields;

  const { data: acquirerOptions = [], isLoading: areAcquirersLoading } =
    useAcquirers();
  const { data: cnaeOptions = [], isLoading: areCnaesLoading } =
    useCnaes(acquirerId);
  const { data: feeCatalog, isLoading } = useFees(acquirerId, cnae);
  const hasFees = feeCatalog
    ? NETWORKS.some((network) => Object.keys(feeCatalog[network]).length > 0)
    : false;
  const anticipationFloor = feeCatalog?.acquirer[-2]?.value ?? null;
  const anticipationFloorPercent = baseFeeAsPercent(anticipationFloor);
  const anticipationSurchargePercent = parseNumber(anticipationFee);
  const anticipationTotalPercent =
    (Number.isNaN(anticipationFloorPercent) ? 0 : anticipationFloorPercent) +
    (Number.isNaN(anticipationSurchargePercent)
      ? 0
      : anticipationSurchargePercent);
  const anticipationTotal = anticipationTotalPercent.toString();

  const acquirerField = (
    <Controller
      name="acquirerId"
      control={control}
      render={({ field: { onChange, value, ref } }) => (
        <Autocomplete
          options={acquirerOptions}
          loading={areAcquirersLoading}
          getOptionLabel={(option) => option.name}
          isOptionEqualToValue={(option, selected) => option.id === selected.id}
          value={acquirerOptions.find((option) => option.id === value) ?? null}
          getOptionKey={(option) => option.id}
          onChange={(_, selected) => {
            onChange(selected?.id);
            setValue("cnae", "");
          }}
          sx={{ flexBasis: "100%" }}
          renderInput={(params) => (
            <TextField
              {...params}
              inputRef={ref}
              label="Adquirente"
              required
              error={Boolean(errors.acquirerId)}
              helperText={errors.acquirerId?.message}
            />
          )}
        />
      )}
    />
  );

  const cnaeField = (
    <Controller
      name="cnae"
      control={control}
      render={({ field: { onChange, value, ref } }) => (
        <Autocomplete
          options={cnaeOptions}
          loading={areCnaesLoading}
          getOptionLabel={(option) => `${option.code} - ${option.description}`}
          isOptionEqualToValue={(option, val) => option.code === val.code}
          value={cnaeOptions.find((option) => option.code === value) ?? null}
          getOptionKey={(option) => option.code}
          onChange={(_, selected) => onChange(selected?.code ?? "")}
          sx={{ flexBasis: "100%" }}
          renderInput={(params) => (
            <TextField
              {...params}
              inputRef={ref}
              label="CNAE"
              required
              error={Boolean(errors.cnae)}
              helperText={errors.cnae?.message}
            />
          )}
        />
      )}
    />
  );

  if (!acquirerId || !cnae) {
    return (
      <FormPaper
        title="Taxas"
        subtitle="Configure as taxas por rede"
        Icon={PercentIcon}
      >
        {acquirerField}
        {cnaeField}
        <Alert severity="info" sx={{ flexBasis: "100%" }}>
          Selecione um adquirente e um CNAE para configurar as taxas.
        </Alert>
      </FormPaper>
    );
  }

  if (isLoading || !feeCatalog || !hasFees) {
    return (
      <FormPaper
        title="Taxas"
        subtitle="Configure as taxas por rede"
        Icon={PercentIcon}
      >
        {acquirerField}
        {cnaeField}
        <Typography sx={{ flexBasis: "100%" }}>
          {isLoading ? "Carregando taxas..." : "Não há taxas para esta seleção."}
        </Typography>
      </FormPaper>
    );
  }

  return (
    <FormPaper
      title="Taxas"
      subtitle="Configure comissão e antecipação por rede"
      Icon={PercentIcon}
    >
      {acquirerField}
      {cnaeField}

      <Controller
        name="anticipation"
        control={control}
        render={({ field: { value, onChange, ref } }) => (
          <FormControlLabel
            control={
              <Switch
                checked={value}
                onChange={(e) => onChange(e.target.checked)}
                ref={ref}
              />
            }
            label="Antecipação"
            sx={{ flexBasis: "200px" }}
          />
        )}
      />

      {anticipation && (
        <TextField
          {...register("anticipation_fee")}
          label="Acréscimo da antecipação"
          type="number"
          required
          error={Boolean(errors.anticipation_fee)}
          helperText={
            errors.anticipation_fee?.message ??
            `Piso: ${formatBaseFee(anticipationFloor)} · Total: ${formatPercent(anticipationTotalPercent)}`
          }
          slotProps={{
            htmlInput: { step: "0.01", min: "0" },
            input: {
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
            },
          }}
          sx={{ flexGrow: 1, flexShrink: 1, flexBasis: "360px" }}
        />
      )}

      <Alert
        severity={anticipation ? "success" : "info"}
        sx={{ flexBasis: "100%" }}
      >
        {anticipation
          ? `Taxa total de antecipação: ${formatBaseFee(anticipationFloor)} de piso + ${formatPercent(Number.isNaN(anticipationSurchargePercent) ? 0 : anticipationSurchargePercent)} de acréscimo = ${formatPercent(anticipationTotalPercent)}.`
          : "Sem antecipação, os pagamentos são processados em 30 dias."}
      </Alert>

      <TextField
        select
        size="small"
        label="Modo de preenchimento das parcelas"
        value={fillMode}
        onChange={(event) => {
          const mode = event.target.value as FillMode;
          const rows = makeInstallmentRows(mode);
          unregister([
            "fees.mastercard.installments",
            "fees.visa.installments",
            "fees.elo.installments",
          ]);
          mastercardInstallments.replace(rows);
          visaInstallments.replace(rows);
          eloInstallments.replace(rows);
          setFillMode(mode);
        }}
        sx={{ flexBasis: "100%", maxWidth: 320 }}
      >
        {FILL_MODES.map((mode) => (
          <MenuItem key={mode} value={mode}>
            {FILL_MODE_LABEL[mode]}
          </MenuItem>
        ))}
      </TextField>

      <Box sx={{ flexBasis: "100%" }}>
        <Tabs
          value={network}
          onChange={(_, v: Network) => setNetwork(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {NETWORKS.map((n) => (
            <Tab
              key={n}
              value={n}
              label={
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Box
                    aria-hidden="true"
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: NETWORK_COLOR[n],
                      flexShrink: 0,
                    }}
                  />
                  <Box component="span">{NETWORK_NAME[n]}</Box>
                </Stack>
              }
            />
          ))}
        </Tabs>
      </Box>

      <UpfrontTable
        network={network}
        feeCatalog={feeCatalog}
        anticipation={anticipation}
        anticipationFee={anticipationTotal}
        control={control}
        feesState={fees}
      />

      {network !== "pix" && (
        <InstallmentsTable
          network={network as CardNetwork}
          feeCatalog={feeCatalog}
          anticipation={anticipation}
          anticipationFee={anticipationTotal}
          control={control}
          fields={installmentFields}
          feesState={fees}
        />
      )}
    </FormPaper>
  );
}

type FormControl = ReturnType<typeof useFormContext<NewPlanFormValues>>["control"];
type FeeCatalog = NonNullable<ReturnType<typeof useFees>["data"]>;

type UpfrontTableProps = {
  network: Network;
  feeCatalog: FeeCatalog;
  anticipation: boolean;
  anticipationFee: string;
  control: FormControl;
  feesState: NewPlanFormValues["fees"];
};

function UpfrontTable({
  network,
  feeCatalog,
  anticipation,
  anticipationFee,
  control,
  feesState,
}: UpfrontTableProps) {
  const rows: {
    label: string;
    paymentType: "debit" | "credit" | "pix";
    baseFee: string | null;
  }[] =
    network === "pix"
      ? [{ label: "Pix", paymentType: "pix", baseFee: feeCatalog.pix[-1]?.value ?? null }]
      : [
          {
            label: "Débito",
            paymentType: "debit",
            baseFee: feeCatalog[network][0]?.value ?? null,
          },
          {
            label: "Crédito 1x",
            paymentType: "credit",
            baseFee: feeCatalog[network][1]?.value ?? null,
          },
        ];

  return (
    <Box sx={{ flexBasis: "100%" }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        À vista
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Forma de pagamento</TableCell>
              <TableCell>Taxa base</TableCell>
              <TableCell>Comissão</TableCell>
              {anticipation && <TableCell>Antecipação</TableCell>}
              <TableCell>Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const rowState =
                network === "pix"
                  ? feesState.pix.pix
                  : feesState[network][row.paymentType as "debit" | "credit"];
              const total = computeTotal(
                row.baseFee,
                rowState?.commission ?? "",
                anticipation ? anticipationFee : "",
              );
              return (
                <TableRow key={row.paymentType}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell>{formatBaseFee(row.baseFee)}</TableCell>
                  <TableCell>
                    <FeeInput
                      control={control}
                      name={`fees.${network}.${row.paymentType}.commission` as FieldPath<NewPlanFormValues>}
                    />
                  </TableCell>
                  {anticipation && (
                    <TableCell>
                      {formatPercent(parseNumber(anticipationFee))}
                    </TableCell>
                  )}
                  <TableCell>{formatPercent(total)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

type InstallmentsTableProps = {
  network: CardNetwork;
  feeCatalog: FeeCatalog;
  anticipation: boolean;
  anticipationFee: string;
  control: FormControl;
  fields: Array<{
    id: string;
    from: number;
    to: number;
    commission: string;
  }>;
  feesState: NewPlanFormValues["fees"];
};

function makeInstallmentRows(fillMode: FillMode) {
  const groupSize = fillMode === "manual" ? 1 : 6;
  const rows = [];
  for (let from = 2; from <= 21; from += groupSize) {
    rows.push({
      from,
      to: Math.min(from + groupSize - 1, 21),
      commission: "",
    });
  }
  return rows;
}

function InstallmentsTable({
  network,
  feeCatalog,
  anticipation,
  anticipationFee,
  control,
  fields,
  feesState,
}: InstallmentsTableProps) {
  return (
    <Box sx={{ flexBasis: "100%" }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Parcelado (2x a 21x)
      </Typography>

      <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Parcelas</TableCell>
              <TableCell>Taxa base</TableCell>
              <TableCell>Comissão</TableCell>
              {anticipation && <TableCell>Antecipação</TableCell>}
              <TableCell>Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {fields.map((field, index) => {
              const row = feesState[network].installments[index] ?? field;
              const baseFees: (string | null)[] = [];
              const totals: number[] = [];
              for (let installments = row.from; installments <= row.to; installments++) {
                const baseFee = feeCatalog[network][installments]?.value ?? null;
                baseFees.push(baseFee);
                totals.push(
                  computeTotal(
                    baseFee,
                    row.commission,
                    anticipation ? anticipationFee : "",
                  ),
                );
              }
              const label =
                row.from === row.to
                  ? `${row.from}x`
                  : `${row.from}x – ${row.to}x`;

              return (
                <TableRow key={field.id}>
                  <TableCell>{label}</TableCell>
                  <TableCell>
                    {formatRange(baseFees.map(baseFeeAsPercent))}
                  </TableCell>
                  <TableCell>
                    <FeeInput
                      control={control}
                      name={`fees.${network}.installments.${index}.commission` as FieldPath<NewPlanFormValues>}
                    />
                  </TableCell>
                  {anticipation && (
                    <TableCell>
                      {formatPercent(parseNumber(anticipationFee))}
                    </TableCell>
                  )}
                  <TableCell>{formatRange(totals)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

type FeeInputProps = {
  control: FormControl;
  name: FieldPath<NewPlanFormValues>;
  disabled?: boolean;
};

function FeeInput({ control, name, disabled }: FeeInputProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={(field.value as string) ?? ""}
          size="small"
          type="number"
          disabled={disabled}
          slotProps={{
            htmlInput: { step: "0.01", min: "0" },
            input: {
              endAdornment: (
                <InputAdornment position="end">%</InputAdornment>
              ),
            },
          }}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message}
          sx={{ width: 130 }}
        />
      )}
    />
  );
}

function computeTotal(
  baseFee: string | null,
  commission: string,
  anticipationFee: string,
): number {
  const b = baseFeeAsPercent(baseFee);
  const c = parseNumber(commission);
  const a = parseNumber(anticipationFee);
  const bv = Number.isNaN(b) ? 0 : b;
  const cv = Number.isNaN(c) ? 0 : c;
  const av = Number.isNaN(a) ? 0 : a;
  return bv + cv + av;
}
