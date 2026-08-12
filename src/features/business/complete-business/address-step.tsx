import TextField from "@mui/material/TextField";
import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { PatternFormat } from "react-number-format";
import { CepValidationError, useCep } from "#hooks/brasilApi/useCep";
import { FormFieldPaper } from "../../../components/multi-step-form";
import type { CompleteBusinessFormValues } from "./types";

const derivedFields = ["state", "city", "neighborhood", "street"] as const;

export function AddressStep() {
  const {
    control,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useFormContext<CompleteBusinessFormValues>();
  const postalCode = useWatch({ control, name: "postalCode" }) ?? "";
  const { data: address, error } = useCep(postalCode);

  useEffect(() => {
    if (postalCode.replace(/\D/g, "").length < 8) {
      derivedFields.forEach((field) => setValue(field, ""));
    }
  }, [postalCode, setValue]);
  useEffect(() => {
    if (!address) return;
    setValue("state", address.state, { shouldValidate: true });
    setValue("city", address.city, { shouldValidate: true });
    setValue("neighborhood", address.neighborhood, { shouldValidate: true });
    setValue("street", address.street, { shouldValidate: true });
    clearErrors("postalCode");
  }, [address, clearErrors, setValue]);
  useEffect(() => {
    if (error instanceof CepValidationError)
      setError("postalCode", { type: "manual", message: "CEP inválido" });
  }, [error, setError]);

  const textField = (
    name:
      | "state"
      | "city"
      | "neighborhood"
      | "street"
      | "number"
      | "complement",
    label: string,
    required = false,
    readOnly = false,
  ) => (
    <FormFieldPaper title={label} error={!!errors[name]} required={required}>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            value={field.value ?? ""}
            variant="standard"
            label={label}
            fullWidth
            required={required}
            slotProps={readOnly ? { input: { readOnly: true } } : undefined}
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
        title="CEP"
        description="O endereço será preenchido automaticamente."
        error={!!errors.postalCode}
        required
      >
        <Controller
          name="postalCode"
          control={control}
          render={({ field: { ref, onChange, value, ...field } }) => (
            <PatternFormat
              {...field}
              value={value}
              format="#####-###"
              onValueChange={(values) => onChange(values.formattedValue)}
              customInput={TextField}
              getInputRef={ref}
              variant="standard"
              label="CEP"
              fullWidth
              required
              error={!!errors.postalCode}
              helperText={errors.postalCode?.message}
            />
          )}
        />
      </FormFieldPaper>
      {textField("state", "Estado", true, true)}
      {textField("city", "Cidade", true, true)}
      {textField("neighborhood", "Bairro", true, true)}
      {textField("street", "Rua", true, true)}
      {textField("number", "Número", true)}
      {textField("complement", "Complemento")}
    </>
  );
}
