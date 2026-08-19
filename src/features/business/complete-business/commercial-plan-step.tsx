import AddIcon from "@mui/icons-material/Add";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { Link as RouterLink } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { NumericFormat } from "react-number-format";
import { usePlans } from "#hooks/quickApi/usePlans";
import { FormFieldPaper } from "../../../components/multi-step-form";
import type { CompleteBusinessFormValues } from "./types";

interface CommercialPlanStepProps {
  businessCnae: number | null | undefined;
  isBusinessLoading: boolean;
}

export function CommercialPlanStep({
  businessCnae,
  isBusinessLoading,
}: CommercialPlanStepProps) {
  const { data: plans = [] } = usePlans();
  const {
    control,
    resetField,
    formState: { errors },
  } = useFormContext<CompleteBusinessFormValues>();
  const acquirerId = useWatch({ control, name: "acquirerId" });
  const planId = useWatch({ control, name: "planId" });
  const filteredPlans = useMemo(
    () =>
      plans.filter(
        (plan) => plan.cnae === businessCnae && plan.acquirer === acquirerId,
      ),
    [acquirerId, businessCnae, plans],
  );

  useEffect(() => {
    if (planId && !filteredPlans.some((plan) => plan.id === planId))
      resetField("planId");
  }, [filteredPlans, planId, resetField]);

  const currencyField = (
    name: "expectedRevenue" | "commitedRevenue",
    title: string,
  ) => (
    <FormFieldPaper title={title} error={!!errors[name]} required>
      <Controller
        name={name}
        control={control}
        render={({ field: { ref, onChange, value, ...field } }) => (
          <NumericFormat
            {...field}
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
            variant="standard"
            label={title}
            fullWidth
            required
            error={!!errors[name]}
            helperText={errors[name]?.message}
          />
        )}
      />
    </FormFieldPaper>
  );

  return (
    <>
      <FormFieldPaper
        title="Plano"
        description="Selecione um plano compatível com o CNAE e adquirente."
        error={!!errors.planId}
        required
      >
        <Controller
          name="planId"
          control={control}
          render={({ field: { onChange, value, ref } }) => (
            <Autocomplete
              options={filteredPlans}
              getOptionLabel={(option) => option.name}
              getOptionKey={(option) => option.id}
              isOptionEqualToValue={(option, selected) =>
                option.id === selected.id
              }
              value={filteredPlans.find((plan) => plan.id === value) ?? null}
              onChange={(_, selected) => onChange(selected?.id)}
              disabled={isBusinessLoading || !businessCnae || !acquirerId}
              renderInput={(params) => (
                <TextField
                  {...params}
                  inputRef={ref}
                  variant="standard"
                  label="Plano"
                  fullWidth
                  required
                  error={!!errors.planId}
                  helperText={
                    errors.planId?.message ??
                    (!businessCnae
                      ? "O estabelecimento não possui CNAE"
                      : !acquirerId
                        ? "Selecione um adquirente primeiro"
                        : filteredPlans.length === 0
                          ? "Sem planos disponíveis"
                          : undefined)
                  }
                />
              )}
            />
          )}
        />
        <Button
          component={RouterLink}
          to="/novo-plano"
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          sx={{ alignSelf: "flex-start" }}
        >
          Novo plano
        </Button>
      </FormFieldPaper>
      {currencyField("expectedRevenue", "Faturamento esperado")}
      {currencyField("commitedRevenue", "Faturamento comprometido")}
      <FormFieldPaper
        title="Quantidade de POS"
        error={!!errors.quantityPos}
        required
      >
        <Controller
          name="quantityPos"
          control={control}
          render={({ field: { onChange, value, ref, ...field } }) => (
            <TextField
              {...field}
              inputRef={ref}
              type="number"
              variant="standard"
              label="Quantidade de POS"
              fullWidth
              required
              value={value ?? ""}
              onChange={(event) =>
                onChange(
                  event.target.value === ""
                    ? undefined
                    : Number(event.target.value),
                )
              }
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              error={!!errors.quantityPos}
              helperText={errors.quantityPos?.message}
            />
          )}
        />
      </FormFieldPaper>
    </>
  );
}
