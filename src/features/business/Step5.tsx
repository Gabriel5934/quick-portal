import AssignmentIcon from "@mui/icons-material/Assignment";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useEffect, useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { NumericFormat } from "react-number-format";
import { useMccs } from "#hooks/quickApi/useMccs";
import { usePlans } from "#hooks/quickApi/usePlans";
import { FormPaper } from "./FormPaper";
import type { CompleteBusinessFormValues } from "./types";

const fieldSx = { flexGrow: 1, flexShrink: 1, flexBasis: "360px" };

export function Step5() {
  const { data: mccOptions = [] } = useMccs();
  const { data: plans = [] } = usePlans();
  const {
    control,
    watch,
    resetField,
    formState: { errors },
  } = useFormContext<CompleteBusinessFormValues>();

  const planMcc = watch("planMcc");
  const planId = watch("planId");

  const filteredPlans = useMemo(
    () => plans.filter((p) => p.mcc.id === planMcc),
    [plans, planMcc],
  );

  useEffect(() => {
    if (planId && !filteredPlans.some((p) => p.id === planId)) {
      resetField("planId");
    }
  }, [filteredPlans, planId, resetField]);

  return (
    <FormPaper
      title="Plano Comercial"
      subtitle="Selecione o MCC e o plano para o estabelecimento"
      Icon={AssignmentIcon}
    >
      <Controller
        name="planMcc"
        control={control}
        render={({ field: { onChange, value, ref } }) => (
          <Autocomplete
            options={mccOptions}
            getOptionLabel={(option) => option.mcc}
            isOptionEqualToValue={(option, val) => option.id === val.id}
            value={mccOptions.find((o) => o.id === value) ?? null}
            getOptionKey={(option) => option.id}
            onChange={(_, selected) => onChange(selected?.id ?? null)}
            sx={fieldSx}
            renderInput={(params) => (
              <TextField
                {...params}
                inputRef={ref}
                label="MCC"
                required
                error={Boolean(errors.planMcc)}
                helperText={errors.planMcc?.message}
              />
            )}
          />
        )}
      />

      <Controller
        name="planId"
        control={control}
        render={({ field: { onChange, value, ref } }) => (
          <Autocomplete
            options={filteredPlans}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, val) => option.id === val.id}
            value={filteredPlans.find((p) => p.id === value) ?? null}
            getOptionKey={(option) => option.id}
            onChange={(_, selected) => onChange(selected?.id ?? null)}
            disabled={!planMcc}
            sx={fieldSx}
            renderInput={(params) => (
              <TextField
                {...params}
                inputRef={ref}
                label="Plano"
                required
                error={Boolean(errors.planId)}
                helperText={
                  errors.planId?.message ??
                  (planMcc ? undefined : "Selecione um MCC primeiro")
                }
              />
            )}
          />
        )}
      />

      <Controller
        name="expectedRevenue"
        control={control}
        render={({ field: { ref, onChange, value, ...restField } }) => (
          <NumericFormat
            {...restField}
            value={value}
            onValueChange={(values) => onChange(values.formattedValue)}
            customInput={TextField}
            getInputRef={ref}
            thousandSeparator="."
            decimalSeparator=","
            decimalScale={2}
            fixedDecimalScale
            allowNegative={false}
            prefix="R$ "
            label="Faturamento Esperado"
            required
            error={Boolean(errors.expectedRevenue)}
            helperText={errors.expectedRevenue?.message}
            sx={fieldSx}
          />
        )}
      />

      <Controller
        name="commitedRevenue"
        control={control}
        render={({ field: { ref, onChange, value, ...restField } }) => (
          <NumericFormat
            {...restField}
            value={value}
            onValueChange={(values) => onChange(values.formattedValue)}
            customInput={TextField}
            getInputRef={ref}
            thousandSeparator="."
            decimalSeparator=","
            decimalScale={2}
            fixedDecimalScale
            allowNegative={false}
            prefix="R$ "
            label="Faturamento Comprometido"
            required
            error={Boolean(errors.commitedRevenue)}
            helperText={errors.commitedRevenue?.message}
            sx={fieldSx}
          />
        )}
      />

      <Controller
        name="quantityPos"
        control={control}
        render={({ field: { onChange, value, ref, ...restField } }) => (
          <TextField
            {...restField}
            inputRef={ref}
            type="number"
            label="Quantidade de POS"
            required
            value={value ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange(v === "" ? undefined : Number(v));
            }}
            slotProps={{ htmlInput: { min: 1, step: 1 } }}
            error={Boolean(errors.quantityPos)}
            helperText={errors.quantityPos?.message}
            sx={fieldSx}
          />
        )}
      />
    </FormPaper>
  );
}
