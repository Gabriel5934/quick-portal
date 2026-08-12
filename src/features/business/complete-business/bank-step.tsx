import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { Controller, useFormContext } from "react-hook-form";
import { PatternFormat } from "react-number-format";
import { useBanks } from "#hooks/brasilApi/useBanks";
import { FormFieldPaper } from "../../../components/multi-step-form";
import type { CompleteBusinessFormValues } from "./types";

export function BankStep() {
  const { data: banks = [] } = useBanks();
  const {
    control,
    formState: { errors },
  } = useFormContext<CompleteBusinessFormValues>();

  return (
    <>
      <FormFieldPaper
        title="Banco"
        description="Selecione o banco da conta."
        error={!!errors.bankCode}
        required
      >
        <Controller
          name="bankCode"
          control={control}
          render={({ field: { onChange, value, ref } }) => (
            <Autocomplete
              options={banks}
              getOptionLabel={(option) => `${option.code} - ${option.name}`}
              getOptionKey={(option) => option.code}
              isOptionEqualToValue={(option, selected) =>
                option.code === selected.code
              }
              value={
                banks.find((option) => String(option.code) === value) ?? null
              }
              onChange={(_, selected) =>
                onChange(selected ? String(selected.code) : "")
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  inputRef={ref}
                  variant="standard"
                  label="Banco"
                  fullWidth
                  required
                  error={!!errors.bankCode}
                  helperText={errors.bankCode?.message}
                />
              )}
            />
          )}
        />
      </FormFieldPaper>
      <FormFieldPaper
        title="Agência"
        description="Informe os quatro dígitos da agência."
        error={!!errors.branch}
        required
      >
        <Controller
          name="branch"
          control={control}
          render={({ field: { ref, onChange, value, ...field } }) => (
            <PatternFormat
              {...field}
              value={value}
              format="####"
              onValueChange={(values) => onChange(values.value)}
              customInput={TextField}
              getInputRef={ref}
              variant="standard"
              label="Agência"
              fullWidth
              required
              error={!!errors.branch}
              helperText={errors.branch?.message}
            />
          )}
        />
      </FormFieldPaper>
      <FormFieldPaper
        title="Dígito da agência"
        error={!!errors.branchDigit}
        required
      >
        <Controller
          name="branchDigit"
          control={control}
          render={({ field: { ref, onChange, value, ...field } }) => (
            <PatternFormat
              {...field}
              value={value}
              format="#"
              onValueChange={(values) => onChange(values.value)}
              customInput={TextField}
              getInputRef={ref}
              variant="standard"
              label="Dígito da agência"
              fullWidth
              required
              error={!!errors.branchDigit}
              helperText={errors.branchDigit?.message}
            />
          )}
        />
      </FormFieldPaper>
      <FormFieldPaper title="Número da conta" error={!!errors.account} required>
        <Controller
          name="account"
          control={control}
          render={({ field: { onChange, value, ...field } }) => (
            <TextField
              {...field}
              value={value}
              onChange={(event) =>
                onChange(event.target.value.replace(/\D/g, ""))
              }
              variant="standard"
              label="Número da conta"
              fullWidth
              required
              slotProps={{ htmlInput: { inputMode: "numeric" } }}
              error={!!errors.account}
              helperText={errors.account?.message}
            />
          )}
        />
      </FormFieldPaper>
      <FormFieldPaper
        title="Dígito da conta"
        error={!!errors.accountDigit}
        required
      >
        <Controller
          name="accountDigit"
          control={control}
          render={({ field: { ref, onChange, value, ...field } }) => (
            <PatternFormat
              {...field}
              value={value}
              format="#"
              onValueChange={(values) => onChange(values.value)}
              customInput={TextField}
              getInputRef={ref}
              variant="standard"
              label="Dígito da conta"
              fullWidth
              required
              error={!!errors.accountDigit}
              helperText={errors.accountDigit?.message}
            />
          )}
        />
      </FormFieldPaper>
    </>
  );
}
