import { useEffect, useMemo, useState } from "react";
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
import { useAcquirers } from "#hooks/quickApi/useAcquirers";
import { useCnaes } from "#hooks/quickApi/useCnaes";
import { useFees } from "#hooks/quickApi/useFees";
import { networkCode, useNetworks } from "#hooks/quickApi/useNetworks";
import { FormPaper } from "../business/FormPaper";
import { makeBlankNetworkFees } from "./schemas";
import type { CardNetworkFees, NewPlanFormValues } from "./schemas";

const FILL_MODES = ["manual", "six"] as const;
type FillMode = (typeof FILL_MODES)[number];

const FILL_MODE_LABEL: Record<FillMode, string> = {
  manual: "Cesta por Parcela",
  six: "Cesta por Bandeira",
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
    getValues,
    setValue,
    watch,
    formState: { errors },
  } = useFormContext<NewPlanFormValues>();
  const acquirerId = watch("acquirerId");
  const cnae = watch("cnae");
  const anticipation = watch("anticipation");
  const anticipationFee = watch("anticipation_fee");
  const fees = watch("fees");

  const [network, setNetwork] = useState("");
  const [fillMode, setFillMode] = useState<FillMode>("manual");

  const { data: acquirerOptions = [], isLoading: areAcquirersLoading } =
    useAcquirers();
  const {
    data: networkOptions = [],
    isLoading: areNetworksLoading,
    error: networksError,
  } = useNetworks();
  const editableNetworks = useMemo(() => {
    const networks = networkOptions.filter(
      (option) => networkCode(option) !== "acquirer",
    );
    return networks.toSorted(
      (left, right) =>
        Number(networkCode(right) === "default") -
        Number(networkCode(left) === "default"),
    );
  }, [networkOptions]);
  const paymentNetworks = useMemo(
    () =>
      editableNetworks.filter((option) => networkCode(option) !== "default"),
    [editableNetworks],
  );
  const cardNetworks = useMemo(
    () => editableNetworks.filter((option) => networkCode(option) !== "pix"),
    [editableNetworks],
  );
  const { data: cnaeOptions = [], isLoading: areCnaesLoading } =
    useCnaes(acquirerId);
  const { data: feeCatalog, isLoading } = useFees(acquirerId, cnae);
  const hasFees = feeCatalog
    ? paymentNetworks.some(
        (option) =>
          Object.keys(feeCatalog[networkCode(option)] ?? {}).length > 0,
      )
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
  const activeNetwork = editableNetworks.some(
    (option) => networkCode(option) === network,
  )
    ? network
    : editableNetworks[0]
      ? networkCode(editableNetworks[0])
      : "";
  const selectedFees = fees[activeNetwork];
  const installmentFields =
    selectedFees && "installments" in selectedFees
      ? selectedFees.installments
      : [];

  useEffect(() => {
    if (editableNetworks.length === 0) return;
    const currentFees = getValues("fees");
    let changed = false;
    const nextFees = { ...currentFees };
    for (const option of editableNetworks) {
      const code = networkCode(option);
      if (!nextFees[code]) {
        nextFees[code] = makeBlankNetworkFees(code);
        changed = true;
      }
    }
    if (changed) setValue("fees", nextFees);
  }, [editableNetworks, getValues, setValue]);

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

  if (networksError) {
    return (
      <FormPaper
        title="Taxas"
        subtitle="Configure as taxas por rede"
        Icon={PercentIcon}
      >
        {acquirerField}
        {cnaeField}
        <Alert severity="error" sx={{ flexBasis: "100%" }}>
          {networksError instanceof Error
            ? networksError.message
            : "Erro ao carregar redes de pagamento."}
        </Alert>
      </FormPaper>
    );
  }

  if (
    areNetworksLoading ||
    isLoading ||
    !feeCatalog ||
    !hasFees ||
    paymentNetworks.length === 0
  ) {
    return (
      <FormPaper
        title="Taxas"
        subtitle="Configure as taxas por rede"
        Icon={PercentIcon}
      >
        {acquirerField}
        {cnaeField}
        <Typography sx={{ flexBasis: "100%" }}>
          {areNetworksLoading || isLoading
            ? "Carregando taxas..."
            : "Não há taxas ou redes para esta seleção."}
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
        label="Tipo de Cesta"
        value={fillMode}
        onChange={(event) => {
          const mode = event.target.value as FillMode;
          const rows = makeInstallmentRows(mode);
          for (const option of cardNetworks) {
            setValue(`fees.${networkCode(option)}.installments`, rows);
          }
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
          value={activeNetwork}
          onChange={(_, value: string) => setNetwork(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {editableNetworks.map((option) => {
            const code = networkCode(option);
            return (
              <Tab
                key={option.id}
                value={code}
                label={
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                  >
                    <Box
                      aria-hidden="true"
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: option.color || "text.disabled",
                        flexShrink: 0,
                      }}
                    />
                    <Box component="span">
                      {code === "default" ? "Padrão" : option.name}
                    </Box>
                  </Stack>
                }
              />
            );
          })}
        </Tabs>
      </Box>

      <UpfrontTable
        network={activeNetwork}
        feeCatalog={feeCatalog}
        anticipation={anticipation}
        anticipationFee={anticipationTotal}
        control={control}
        feesState={fees}
        defaultFees={
          fees.default && "debit" in fees.default ? fees.default : undefined
        }
      />

      {activeNetwork !== "pix" && (
        <InstallmentsTable
          network={activeNetwork}
          feeCatalog={feeCatalog}
          anticipation={anticipation}
          anticipationFee={anticipationTotal}
          control={control}
          fields={installmentFields}
          feesState={fees}
          defaultFees={
            fees.default && "debit" in fees.default ? fees.default : undefined
          }
        />
      )}
    </FormPaper>
  );
}

type FormControl = ReturnType<
  typeof useFormContext<NewPlanFormValues>
>["control"];
type FeeCatalog = NonNullable<ReturnType<typeof useFees>["data"]>;

type UpfrontTableProps = {
  network: string;
  feeCatalog: FeeCatalog;
  anticipation: boolean;
  anticipationFee: string;
  control: FormControl;
  feesState: NewPlanFormValues["fees"];
  defaultFees?: CardNetworkFees;
};

function UpfrontTable({
  network,
  feeCatalog,
  anticipation,
  anticipationFee,
  control,
  feesState,
  defaultFees,
}: UpfrontTableProps) {
  const rows: {
    label: string;
    paymentType: "debit" | "credit" | "pix";
    baseFee: string | null;
  }[] =
    network === "pix"
      ? [
          {
            label: "Pix",
            paymentType: "pix",
            baseFee: feeCatalog.pix?.[-1]?.value ?? null,
          },
        ]
      : [
          {
            label: "Débito",
            paymentType: "debit",
            baseFee: feeCatalog[network]?.[0]?.value ?? null,
          },
          {
            label: "Crédito 1x",
            paymentType: "credit",
            baseFee: feeCatalog[network]?.[1]?.value ?? null,
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
              const networkState = feesState[network];
              const rowState =
                network === "pix" && networkState && "pix" in networkState
                  ? networkState.pix
                  : networkState && "debit" in networkState
                    ? networkState[row.paymentType as "debit" | "credit"]
                    : undefined;
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
                      name={`fees.${network}.${row.paymentType}.commission`}
                      placeholder={
                        network === "default" || row.paymentType === "pix"
                          ? undefined
                          : defaultFees?.[row.paymentType].commission
                      }
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
  network: string;
  feeCatalog: FeeCatalog;
  anticipation: boolean;
  anticipationFee: string;
  control: FormControl;
  fields: Array<{
    from: number;
    to: number;
    commission: string;
  }>;
  feesState: NewPlanFormValues["fees"];
  defaultFees?: CardNetworkFees;
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
  defaultFees,
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
              const networkState = feesState[network];
              const row =
                networkState && "installments" in networkState
                  ? (networkState.installments[index] ?? field)
                  : field;
              const baseFees: (string | null)[] = [];
              const totals: number[] = [];
              for (
                let installments = row.from;
                installments <= row.to;
                installments++
              ) {
                const baseFee =
                  feeCatalog[network]?.[installments]?.value ?? null;
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
                <TableRow key={`${field.from}-${field.to}-${index}`}>
                  <TableCell>{label}</TableCell>
                  <TableCell>
                    {formatRange(baseFees.map(baseFeeAsPercent))}
                  </TableCell>
                  <TableCell>
                    <FeeInput
                      control={control}
                      name={`fees.${network}.installments.${index}.commission`}
                      placeholder={
                        network === "default"
                          ? undefined
                          : defaultFees?.installments.find(
                              (candidate) =>
                                candidate.from === row.from &&
                                candidate.to === row.to,
                            )?.commission
                      }
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
  placeholder?: string;
};

function FeeInput({ control, name, disabled, placeholder }: FeeInputProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ""}
          size="small"
          type="number"
          disabled={disabled}
          placeholder={placeholder}
          slotProps={{
            htmlInput: { step: "0.01", min: "0" },
            input: {
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
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
