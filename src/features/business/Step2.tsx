import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import { Controller, useFormContext } from "react-hook-form";
import { PatternFormat } from "react-number-format";
import { useBanks } from "#hooks/brasilApi/useBanks";
import { FormPaper } from "./FormPaper";
import type { CompleteBusinessFormValues } from "./types";

const fieldSx = { flexGrow: 1, flexShrink: 1, flexBasis: "360px" };

export function Step2() {
  const { data: bankOptions = [] } = useBanks();
  const {
    control,
    formState: { errors },
  } = useFormContext<CompleteBusinessFormValues>();

  return (
    <FormPaper
      title="Dados Bancários"
      subtitle="Informações da conta bancária do estabelecimento"
      Icon={AccountBalanceIcon}
    >
      <Controller
        name="bankCode"
        control={control}
        render={({ field: { onChange, value, ref } }) => (
          <Autocomplete
            options={bankOptions}
            getOptionLabel={(option) => `${option.code} - ${option.name}`}
            getOptionKey={(option) => option.ispb}
            isOptionEqualToValue={(option, val) => option.code === val.code}
            value={bankOptions.find((o) => String(o.code) === value) ?? null}
            onChange={(_, selected) =>
              onChange(selected ? String(selected.code) : "")
            }
            sx={fieldSx}
            renderInput={(params) => (
              <TextField
                {...params}
                inputRef={ref}
                label="Código do Banco"
                required
                error={Boolean(errors.bankCode)}
                helperText={errors.bankCode?.message}
              />
            )}
          />
        )}
      />

      <Controller
        name="branch"
        control={control}
        render={({ field: { ref, onChange, value, ...restField } }) => (
          <PatternFormat
            {...restField}
            value={value}
            format="####"
            onValueChange={(values) => onChange(values.value)}
            customInput={TextField}
            getInputRef={ref}
            label="Agência"
            required
            error={Boolean(errors.branch)}
            helperText={errors.branch?.message}
            sx={fieldSx}
          />
        )}
      />

      <Controller
        name="branchDigit"
        control={control}
        render={({ field: { ref, onChange, value, ...restField } }) => (
          <PatternFormat
            {...restField}
            value={value}
            format="#"
            onValueChange={(values) => onChange(values.value)}
            customInput={TextField}
            getInputRef={ref}
            label="Dígito Agência"
            required
            error={Boolean(errors.branchDigit)}
            helperText={errors.branchDigit?.message}
            sx={fieldSx}
          />
        )}
      />

      <Controller
        name="account"
        control={control}
        render={({ field: { onChange, value, ...restField } }) => (
          <TextField
            {...restField}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
            label="Número da Conta"
            required
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            error={Boolean(errors.account)}
            helperText={errors.account?.message}
            sx={fieldSx}
          />
        )}
      />

      <Controller
        name="accountDigit"
        control={control}
        render={({ field: { ref, onChange, value, ...restField } }) => (
          <PatternFormat
            {...restField}
            value={value}
            format="#"
            onValueChange={(values) => onChange(values.value)}
            customInput={TextField}
            getInputRef={ref}
            label="Dígito da Conta"
            required
            error={Boolean(errors.accountDigit)}
            helperText={errors.accountDigit?.message}
            sx={fieldSx}
          />
        )}
      />
    </FormPaper>
  );
}
