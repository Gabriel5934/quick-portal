import { useEffect, useState } from "react";
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
import { Controller, useFormContext } from "react-hook-form";
import type { FieldPath } from "react-hook-form";
import { useMccFee } from "#hooks/quickApi/useMccFee";
import { useMccs } from "#hooks/quickApi/useMccs";
import { FormPaper } from "../business/FormPaper";
import { INSTALLMENT_TYPES, NETWORKS, installmentLevel } from "./schemas";
import type { CardNetwork, Network, NewPlanFormValues } from "./schemas";

const FILL_MODES = ["manual", "range", "single", "multiplier"] as const;
type FillMode = (typeof FILL_MODES)[number];

const NETWORK_LABEL: Record<Network, string> = {
  mastercard: "Mastercard",
  visa: "Visa",
  elo: "Elo",
  pix: "Pix",
};

const FILL_MODE_LABEL: Record<FillMode, string> = {
  manual: "Manual",
  range: "Por intervalo",
  single: "Único",
  multiplier: "Multiplicador",
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
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<NewPlanFormValues>();
  const mccId = watch("mccId");
  const anticipation = watch("anticipation");
  const anticipationFee = watch("anticipation_fee");
  const fees = watch("fees");

  const [network, setNetwork] = useState<Network>("mastercard");
  const [fillMode, setFillMode] = useState<FillMode>("manual");

  const { data: mccOptions = [] } = useMccs();
  const { data: mccFee, isLoading } = useMccFee(mccId);

  const mccField = (
    <Controller
      name="mccId"
      control={control}
      render={({ field: { onChange, value, ref } }) => (
        <Autocomplete
          options={mccOptions}
          getOptionLabel={(option) => option.mcc}
          isOptionEqualToValue={(option, val) => option.id === val.id}
          value={mccOptions.find((o) => o.id === value) ?? null}
          getOptionKey={(option) => option.id}
          onChange={(_, selected) => onChange(selected?.id ?? null)}
          sx={{ flexBasis: "100%" }}
          renderInput={(params) => (
            <TextField
              {...params}
              inputRef={ref}
              label="MCC"
              required
              error={Boolean(errors.mccId)}
              helperText={errors.mccId?.message}
            />
          )}
        />
      )}
    />
  );

  if (!mccId) {
    return (
      <FormPaper
        title="Taxas"
        subtitle="Configure as taxas por rede"
        Icon={PercentIcon}
      >
        {mccField}
        <Alert severity="info" sx={{ flexBasis: "100%" }}>
          Selecione um MCC para configurar as taxas.
        </Alert>
      </FormPaper>
    );
  }

  if (isLoading || !mccFee) {
    return (
      <FormPaper
        title="Taxas"
        subtitle="Configure as taxas por rede"
        Icon={PercentIcon}
      >
        {mccField}
        <Typography sx={{ flexBasis: "100%" }}>Carregando taxas...</Typography>
      </FormPaper>
    );
  }

  return (
    <FormPaper
      title="Taxas"
      subtitle="Configure comissão e antecipação por rede"
      Icon={PercentIcon}
    >
      {mccField}

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
          label="Taxa de antecipação"
          type="number"
          required
          error={Boolean(errors.anticipation_fee)}
          helperText={errors.anticipation_fee?.message}
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
          ? "Com antecipação ativa, os pagamentos são processados em 1 dia útil."
          : "Sem antecipação, os pagamentos são processados em 30 dias."}
      </Alert>

      <Box sx={{ flexBasis: "100%" }}>
        <Tabs
          value={network}
          onChange={(_, v: Network) => setNetwork(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {NETWORKS.map((n) => (
            <Tab key={n} value={n} label={NETWORK_LABEL[n]} />
          ))}
        </Tabs>
      </Box>

      <UpfrontTable
        network={network}
        mccFee={mccFee}
        anticipation={anticipation}
        anticipationFee={anticipationFee}
        control={control}
        feesState={fees}
      />

      {network !== "pix" && (
        <InstallmentsTable
          network={network as CardNetwork}
          mccFee={mccFee}
          anticipation={anticipation}
          anticipationFee={anticipationFee}
          control={control}
          setValue={setValue}
          fillMode={fillMode}
          onFillModeChange={setFillMode}
          feesState={fees}
        />
      )}
    </FormPaper>
  );
}

type FormControl = ReturnType<typeof useFormContext<NewPlanFormValues>>["control"];
type FormSetValue = ReturnType<typeof useFormContext<NewPlanFormValues>>["setValue"];
type MccFee = NonNullable<ReturnType<typeof useMccFee>["data"]>;
type NetworkFeesRecord = Record<
  string,
  { commission: string } | undefined
>;

type UpfrontTableProps = {
  network: Network;
  mccFee: MccFee;
  anticipation: boolean;
  anticipationFee: string;
  control: FormControl;
  feesState: NewPlanFormValues["fees"];
};

function UpfrontTable({
  network,
  mccFee,
  anticipation,
  anticipationFee,
  control,
  feesState,
}: UpfrontTableProps) {
  const rows: { label: string; paymentType: string; baseFee: string | null }[] =
    network === "pix"
      ? [{ label: "Pix", paymentType: "pix", baseFee: mccFee.fee.pix.pix }]
      : [
          {
            label: "Débito",
            paymentType: "debit",
            baseFee: mccFee.fee[network as CardNetwork].debit,
          },
          {
            label: "Crédito 1x",
            paymentType: "credit",
            baseFee: mccFee.fee[network as CardNetwork].credit,
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
              const rowState = (feesState[network] as NetworkFeesRecord)[
                row.paymentType
              ];
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
  mccFee: MccFee;
  anticipation: boolean;
  anticipationFee: string;
  control: FormControl;
  setValue: FormSetValue;
  fillMode: FillMode;
  onFillModeChange: (mode: FillMode) => void;
  feesState: NewPlanFormValues["fees"];
};

type RowDef = {
  kind: "manual" | "single" | "range" | "multiplier-leader" | "multiplier-derived";
  from: number;
  to: number;
};

function InstallmentsTable({
  network,
  mccFee,
  anticipation,
  anticipationFee,
  control,
  setValue,
  fillMode,
  onFillModeChange,
  feesState,
}: InstallmentsTableProps) {
  const [rangeSize, setRangeSize] = useState(5);
  const [multiplier, setMultiplier] = useState("");
  const [singleValues, setSingleValues] = useState({ commission: "" });
  const [rangeValues, setRangeValues] = useState<
    Record<number, { commission: string }>
  >({});

  useEffect(() => {
    INSTALLMENT_TYPES.forEach((t) => {
      setValue(
        `fees.${network}.${t}.commission` as FieldPath<NewPlanFormValues>,
        "" as never,
      );
    });
    setSingleValues({ commission: "" });
    setRangeValues({});
    setMultiplier("");
    setRangeSize(5);
    // Only react to fillMode changes — switching networks must not wipe
    // the form values the user just entered for the previous network.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillMode]);

  useEffect(() => {
    setSingleValues({ commission: "" });
    setRangeValues({});
    setMultiplier("");
  }, [network]);

  const tx2 = (feesState[network] as NetworkFeesRecord)["2x"];
  const tx2Commission = tx2?.commission ?? "";

  useEffect(() => {
    if (fillMode !== "multiplier") return;
    const m = parseNumber(multiplier);
    const mv = Number.isNaN(m) ? 0 : m;
    const b = parseNumber(tx2Commission);
    const bv = Number.isNaN(b) ? 0 : b;
    INSTALLMENT_TYPES.forEach((t, idx) => {
      if (idx === 0) return;
      const value = tx2Commission === "" ? "" : (bv + idx * mv).toFixed(2);
      setValue(
        `fees.${network}.${t}.commission` as FieldPath<NewPlanFormValues>,
        value as never,
      );
    });
  }, [fillMode, multiplier, tx2Commission, network, setValue]);

  let rowDefs: RowDef[] = [];
  if (fillMode === "manual") {
    rowDefs = INSTALLMENT_TYPES.map((_, i) => ({
      kind: "manual",
      from: i,
      to: i,
    }));
  } else if (fillMode === "single") {
    rowDefs = [{ kind: "single", from: 0, to: INSTALLMENT_TYPES.length - 1 }];
  } else if (fillMode === "range") {
    for (let i = 0; i < INSTALLMENT_TYPES.length; i += rangeSize) {
      const to = Math.min(i + rangeSize - 1, INSTALLMENT_TYPES.length - 1);
      rowDefs.push({ kind: "range", from: i, to });
    }
  } else {
    rowDefs = INSTALLMENT_TYPES.map((_, i) => ({
      kind: i === 0 ? "multiplier-leader" : "multiplier-derived",
      from: i,
      to: i,
    }));
  }

  return (
    <Box sx={{ flexBasis: "100%" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          mb: 1,
          alignItems: { sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <Typography variant="subtitle2">Parcelado (2x a 21x)</Typography>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ alignItems: { sm: "flex-start" } }}
        >
          {fillMode === "range" && (
            <TextField
              size="small"
              label="Tamanho do intervalo"
              type="number"
              value={rangeSize}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v >= 1 && v <= INSTALLMENT_TYPES.length) setRangeSize(v);
              }}
              slotProps={{
                htmlInput: { min: 1, max: INSTALLMENT_TYPES.length },
              }}
              sx={{ width: 180 }}
            />
          )}
          {fillMode === "multiplier" && (
            <TextField
              size="small"
              label="Multiplicador"
              type="number"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              slotProps={{
                htmlInput: { step: "0.01" },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">%</InputAdornment>
                  ),
                },
              }}
              helperText="nx = 2x + (n − 2) · mult"
              sx={{ width: 200 }}
            />
          )}
          <TextField
            select
            size="small"
            label="Modo de preenchimento"
            value={fillMode}
            onChange={(e) => onFillModeChange(e.target.value as FillMode)}
            sx={{ minWidth: 220 }}
          >
            {FILL_MODES.map((m) => (
              <MenuItem key={m} value={m}>
                {FILL_MODE_LABEL[m]}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Stack>

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
            {rowDefs.map((row) => (
              <InstallmentRow
                key={`${row.kind}-${row.from}`}
                row={row}
                network={network}
                mccFee={mccFee}
                anticipation={anticipation}
                anticipationFee={anticipationFee}
                control={control}
                setValue={setValue}
                feesState={feesState}
                singleValues={singleValues}
                setSingleValues={setSingleValues}
                rangeValues={rangeValues}
                setRangeValues={setRangeValues}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

type InstallmentRowProps = {
  row: RowDef;
  network: CardNetwork;
  mccFee: MccFee;
  anticipation: boolean;
  anticipationFee: string;
  control: FormControl;
  setValue: FormSetValue;
  feesState: NewPlanFormValues["fees"];
  singleValues: { commission: string };
  setSingleValues: (v: { commission: string }) => void;
  rangeValues: Record<number, { commission: string }>;
  setRangeValues: (v: Record<number, { commission: string }>) => void;
};

function InstallmentRow({
  row,
  network,
  mccFee,
  anticipation,
  anticipationFee,
  control,
  setValue,
  feesState,
  singleValues,
  setSingleValues,
  rangeValues,
  setRangeValues,
}: InstallmentRowProps) {
  const label =
    row.from === row.to
      ? INSTALLMENT_TYPES[row.from]
      : `${INSTALLMENT_TYPES[row.from]} – ${INSTALLMENT_TYPES[row.to]}`;

  const baseFees: (string | null)[] = [];
  for (let i = row.from; i <= row.to; i++) {
    baseFees.push(mccFee.fee[network][installmentLevel(INSTALLMENT_TYPES[i])]);
  }
  const baseFeeLabel = formatRange(baseFees.map(baseFeeAsPercent));

  const networkFees = feesState[network] as NetworkFeesRecord;

  const renderCommission = () => {
    if (row.kind === "manual" || row.kind === "multiplier-leader") {
      return (
        <FeeInput
          control={control}
          name={`fees.${network}.${INSTALLMENT_TYPES[row.from]}.commission` as FieldPath<NewPlanFormValues>}
        />
      );
    }
    if (row.kind === "multiplier-derived") {
      return (
        <FeeInput
          control={control}
          name={`fees.${network}.${INSTALLMENT_TYPES[row.from]}.commission` as FieldPath<NewPlanFormValues>}
          disabled
        />
      );
    }
    if (row.kind === "single") {
      return (
        <AggregateInput
          value={singleValues.commission}
          onChange={(v) => {
            setSingleValues({ commission: v });
            INSTALLMENT_TYPES.forEach((t) =>
              setValue(
                `fees.${network}.${t}.commission` as FieldPath<NewPlanFormValues>,
                v as never,
              ),
            );
          }}
        />
      );
    }
    const current = rangeValues[row.from] ?? { commission: "" };
    return (
      <AggregateInput
        value={current.commission}
        onChange={(v) => {
          setRangeValues({
            ...rangeValues,
            [row.from]: { commission: v },
          });
          for (let i = row.from; i <= row.to; i++) {
            setValue(
              `fees.${network}.${INSTALLMENT_TYPES[i]}.commission` as FieldPath<NewPlanFormValues>,
              v as never,
            );
          }
        }}
      />
    );
  };

  const totals: number[] = [];
  for (let i = row.from; i <= row.to; i++) {
    const t = INSTALLMENT_TYPES[i];
    const rowState = networkFees[t];
    totals.push(
      computeTotal(
        mccFee.fee[network][installmentLevel(t)],
        rowState?.commission ?? "",
        anticipation ? anticipationFee : "",
      ),
    );
  }
  const totalLabel = formatRange(totals);

  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell>{baseFeeLabel}</TableCell>
      <TableCell>{renderCommission()}</TableCell>
      {anticipation && (
        <TableCell>{formatPercent(parseNumber(anticipationFee))}</TableCell>
      )}
      <TableCell>{totalLabel}</TableCell>
    </TableRow>
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

type AggregateInputProps = {
  value: string;
  onChange: (v: string) => void;
};

function AggregateInput({ value, onChange }: AggregateInputProps) {
  return (
    <TextField
      value={value}
      onChange={(e) => onChange(e.target.value)}
      size="small"
      type="number"
      slotProps={{
        htmlInput: { step: "0.01", min: "0" },
        input: {
          endAdornment: <InputAdornment position="end">%</InputAdornment>,
        },
      }}
      sx={{ width: 130 }}
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
