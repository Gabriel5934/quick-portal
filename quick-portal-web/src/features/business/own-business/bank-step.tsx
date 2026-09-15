import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { Controller, useFormContext } from "react-hook-form";
import { PatternFormat } from "react-number-format";
import { useBanks } from "#hooks/brasilApi/useBanks";
import { FormFieldPaper } from "../../../components/multi-step-form";
import type { OwnBusinessFormValues } from "./types";

export function BankStep() {
  const { data: banks = [] } = useBanks();
  const {
    control,
    formState: { errors },
  } = useFormContext<OwnBusinessFormValues>();

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
        error={!!errors.branch || !!errors.branchDigit}
        required
      >
        <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
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
          </Box>
          <Box sx={{ width: { xs: 96, sm: 120 }, flexShrink: 0 }}>
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
                  label="Dígito"
                  fullWidth
                  required
                  error={!!errors.branchDigit}
                  helperText={errors.branchDigit?.message}
                />
              )}
            />
          </Box>
        </Stack>
      </FormFieldPaper>
      <FormFieldPaper
        title="Conta"
        error={!!errors.account || !!errors.accountDigit}
        required
      >
        <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
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
          </Box>
          <Box sx={{ width: { xs: 96, sm: 120 }, flexShrink: 0 }}>
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
                  label="Dígito"
                  fullWidth
                  required
                  error={!!errors.accountDigit}
                  helperText={errors.accountDigit?.message}
                />
              )}
            />
          </Box>
        </Stack>
      </FormFieldPaper>
    </>
  );
}
