import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { PatternFormat } from "react-number-format";
import { CepValidationError, type CepData } from "#hooks/brasilApi/useCep";
import {
  DerivedTextField,
  FormFieldPaper,
} from "../../components/multi-step-form";
import type { CieloBusinessFormValues } from "./types";

const managedFields = [
  "addressStreet",
  "addressNeighborhood",
  "addressCity",
  "addressState",
] as const;

export function CieloAddressStep({
  address,
  error,
  isFetching,
}: {
  address: CepData | undefined;
  error: Error | null;
  isFetching: boolean;
}) {
  const {
    control,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useFormContext<CieloBusinessFormValues>();
  const zipCode = useWatch({ control, name: "addressZipCode" });

  useEffect(() => {
    managedFields.forEach((field) => setValue(field, ""));
  }, [setValue, zipCode]);

  useEffect(() => {
    if (!address) return;
    setValue("addressStreet", address.street, { shouldValidate: true });
    setValue("addressNeighborhood", address.neighborhood, {
      shouldValidate: true,
    });
    setValue("addressCity", address.city, { shouldValidate: true });
    setValue("addressState", address.state, { shouldValidate: true });
    clearErrors("addressZipCode");
  }, [address, clearErrors, setValue]);

  useEffect(() => {
    if (!error) return;
    setError("addressZipCode", {
      type: "manual",
      message:
        error instanceof CepValidationError
          ? "CEP inválido"
          : "Falha ao consultar o CEP na BrasilAPI",
    });
  }, [error, setError]);

  return (
    <FormFieldPaper
      title="Endereço"
      description="Rua, bairro, cidade e estado são gerenciados pela BrasilAPI."
      error={
        !!errors.addressZipCode ||
        managedFields.some((field) => !!errors[field])
      }
      required
    >
      <Stack spacing={2}>
        <Controller
          name="addressZipCode"
          control={control}
          render={({ field: { ref, onChange, value, ...field } }) => (
            <PatternFormat
              {...field}
              value={value}
              format="#####-###"
              onValueChange={(values) => onChange(values.formattedValue)}
              customInput={TextField}
              getInputRef={ref}
              label="CEP"
              required
              error={!!errors.addressZipCode}
              helperText={errors.addressZipCode?.message}
            />
          )}
        />
        <Controller
          name="addressNumber"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Número"
              required
              error={!!errors.addressNumber}
              helperText={errors.addressNumber?.message}
            />
          )}
        />
        <Controller
          name="addressComplement"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Complemento"
              error={!!errors.addressComplement}
              helperText={errors.addressComplement?.message}
            />
          )}
        />
        <Controller
          name="addressStreet"
          control={control}
          render={({ field }) => (
            <DerivedTextField
              {...field}
              label="Rua"
              loading={isFetching}
              required
            />
          )}
        />
        <Controller
          name="addressNeighborhood"
          control={control}
          render={({ field }) => (
            <DerivedTextField
              {...field}
              label="Bairro"
              loading={isFetching}
              required
            />
          )}
        />
        <Controller
          name="addressCity"
          control={control}
          render={({ field }) => (
            <DerivedTextField
              {...field}
              label="Cidade"
              loading={isFetching}
              required
            />
          )}
        />
        <Controller
          name="addressState"
          control={control}
          render={({ field }) => (
            <DerivedTextField
              {...field}
              label="Estado"
              loading={isFetching}
              required
            />
          )}
        />
      </Stack>
    </FormFieldPaper>
  );
}
