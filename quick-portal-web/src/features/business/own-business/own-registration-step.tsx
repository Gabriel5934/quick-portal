import AddIcon from "@mui/icons-material/Add";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { Link as RouterLink } from "@tanstack/react-router";
import { Controller, useFormContext } from "react-hook-form";
import { NumericFormat, PatternFormat } from "react-number-format";
import { useOwnPlans } from "#hooks/quickApi/useOwnPlans";
import { FormFieldPaper } from "../../../components/multi-step-form";
import type { OwnBusinessFormValues } from "./types";

export function OwnRegistrationStep() {
  const { data: plans = [] } = useOwnPlans();
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<OwnBusinessFormValues>();

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
        title="Responsável pela assinatura"
        description="Informe quem assinará o credenciamento com a OWN."
        error={
          !!errors.signatoryName ||
          !!errors.signatoryCpf ||
          !!errors.signatoryEmail
        }
        required
      >
        <Controller
          name="signatoryName"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              variant="standard"
              label="Nome completo"
              fullWidth
              required
              error={!!errors.signatoryName}
              helperText={errors.signatoryName?.message}
            />
          )}
        />
        <Controller
          name="signatoryCpf"
          control={control}
          render={({ field: { ref, onChange, value, ...field } }) => (
            <PatternFormat
              {...field}
              value={value}
              format="###.###.###-##"
              onValueChange={(values) => onChange(values.formattedValue)}
              customInput={TextField}
              getInputRef={ref}
              variant="standard"
              label="CPF"
              fullWidth
              required
              error={!!errors.signatoryCpf}
              helperText={errors.signatoryCpf?.message}
            />
          )}
        />
        <Controller
          name="signatoryEmail"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              type="email"
              variant="standard"
              label="E-mail"
              fullWidth
              required
              error={!!errors.signatoryEmail}
              helperText={errors.signatoryEmail?.message}
            />
          )}
        />
      </FormFieldPaper>
      <FormFieldPaper
        title="Plano OWN"
        description="Selecione o plano comercial da OWN."
        error={!!errors.planId}
        required
      >
        <Controller
          name="planId"
          control={control}
          render={({ field: { onChange, value, ref } }) => (
            <Autocomplete
              options={plans}
              getOptionLabel={(option) => option.title}
              getOptionKey={(option) => option.id}
              isOptionEqualToValue={(option, selected) =>
                option.id === selected.id
              }
              value={plans.find((plan) => plan.id === value) ?? null}
              onChange={(_, selected) => {
                onChange(selected?.id);
                setValue("activityId", selected?.activity ?? 0, {
                  shouldValidate: true,
                });
              }}
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
                    (plans.length === 0 ? "Sem planos disponíveis" : undefined)
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
