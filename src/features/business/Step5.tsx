import AddIcon from "@mui/icons-material/Add";
import AssignmentIcon from "@mui/icons-material/Assignment";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { Link as RouterLink } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { NumericFormat } from "react-number-format";
import { useAcquirers } from "#hooks/quickApi/useAcquirers";
import { usePlans } from "#hooks/quickApi/usePlans";
import { FormPaper } from "./FormPaper";
import type { CompleteBusinessFormValues } from "./types";

const fieldSx = { flexGrow: 1, flexShrink: 1, flexBasis: "360px" };

interface Step5Props {
  businessCnae: number | null | undefined;
  isBusinessLoading: boolean;
}

export function Step5({ businessCnae, isBusinessLoading }: Step5Props) {
  const { data: acquirerOptions = [], isLoading: areAcquirersLoading } =
    useAcquirers();
  const { data: plans = [] } = usePlans();
  const {
    control,
    watch,
    resetField,
    formState: { errors },
  } = useFormContext<CompleteBusinessFormValues>();

  const acquirerId = watch("acquirerId");
  const planId = watch("planId");

  const filteredPlans = useMemo(
    () =>
      plans.filter(
        (plan) =>
          plan.cnae === businessCnae && plan.acquirer === acquirerId,
      ),
    [plans, businessCnae, acquirerId],
  );

  useEffect(() => {
    if (planId && !filteredPlans.some((p) => p.id === planId)) {
      resetField("planId");
    }
  }, [filteredPlans, planId, resetField]);

  return (
    <FormPaper
      title="Plano Comercial"
      subtitle="Selecione o plano para o estabelecimento"
      Icon={AssignmentIcon}
      action={
        <Button
          component={RouterLink}
          to="/novo-plano"
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          sx={{ whiteSpace: "nowrap" }}
        >
          Novo Plano
        </Button>
      }
    >
      <Controller
        name="acquirerId"
        control={control}
        render={({ field: { onChange, value, ref } }) => (
          <Autocomplete
            options={acquirerOptions}
            loading={areAcquirersLoading}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(option, selected) =>
              option.id === selected.id
            }
            value={
              acquirerOptions.find((option) => option.id === value) ?? null
            }
            getOptionKey={(option) => option.id}
            onChange={(_, selected) => onChange(selected?.id)}
            sx={fieldSx}
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
            disabled={isBusinessLoading || !businessCnae || !acquirerId}
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
                  (!businessCnae
                    ? "O estabelecimento não possui CNAE"
                    : !acquirerId
                      ? "Selecione um adquirente primeiro"
                      : filteredPlans.length === 0
                        ? "Sem planos disponíveis para esse CNAE e adquirente"
                        : undefined)
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
