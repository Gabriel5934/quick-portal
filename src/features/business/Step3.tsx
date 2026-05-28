import TextField from "@mui/material/TextField";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import { Controller, useFormContext } from "react-hook-form";
import { PatternFormat } from "react-number-format";
import { useEffect } from "react";
import { useCep, CepValidationError } from "../../hooks/useCep";
import { FormPaper } from "./FormPaper";
import type { NewBusinessFormValues } from "./types";

const fieldSx = { flexGrow: 1, flexShrink: 1, flexBasis: "360px" };

export function Step3() {
  const {
    control,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useFormContext<NewBusinessFormValues>();

  const postalCode = watch("postalCode") ?? "";
  const { data: cepData, error: cepError } = useCep(postalCode);

  const derivedFields = ["state", "city", "neighborhood", "street"] as const;

  useEffect(() => {
    if (postalCode.replace(/\D/g, "").length < 8) {
      derivedFields.forEach((f) => setValue(f, ""));
    }
  }, [postalCode, setValue]);

  useEffect(() => {
    if (cepData) {
      setValue("state", cepData.state, { shouldValidate: true });
      setValue("city", cepData.city, { shouldValidate: true });
      setValue("neighborhood", cepData.neighborhood, { shouldValidate: true });
      setValue("street", cepData.street, { shouldValidate: true });
      clearErrors("postalCode");
    }
  }, [cepData, setValue, clearErrors]);

  useEffect(() => {
    if (cepError instanceof CepValidationError) {
      setError("postalCode", { type: "manual", message: "CEP inválido" });
    }
  }, [cepError, setError]);

  return (
    <FormPaper
      title="Endereço"
      subtitle="Endereço do estabelecimento comercial"
      Icon={LocationOnIcon}
    >
      <Controller
        name="postalCode"
        control={control}
        render={({ field: { ref, onChange, value, ...restField } }) => (
          <PatternFormat
            {...restField}
            value={value ?? ""}
            format="#####-###"
            onValueChange={(values) => onChange(values.formattedValue)}
            customInput={TextField}
            getInputRef={ref}
            label="CEP"
            required
            error={Boolean(errors.postalCode)}
            helperText={errors.postalCode?.message}
            sx={fieldSx}
          />
        )}
      />

      <Controller
        name="state"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            value={field.value ?? ""}
            label="Estado"
            required
            disabled
            error={Boolean(errors.state)}
            helperText={errors.state?.message}
            sx={fieldSx}
          />
        )}
      />

      <Controller
        name="city"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            value={field.value ?? ""}
            label="Cidade"
            required
            disabled
            error={Boolean(errors.city)}
            helperText={errors.city?.message}
            sx={fieldSx}
          />
        )}
      />

      <Controller
        name="neighborhood"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            value={field.value ?? ""}
            label="Bairro"
            required
            disabled
            error={Boolean(errors.neighborhood)}
            helperText={errors.neighborhood?.message}
            sx={fieldSx}
          />
        )}
      />

      <Controller
        name="street"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            value={field.value ?? ""}
            label="Rua"
            required
            disabled
            error={Boolean(errors.street)}
            helperText={errors.street?.message}
            sx={fieldSx}
          />
        )}
      />

      <Controller
        name="number"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            value={field.value ?? ""}
            label="Número"
            required
            error={Boolean(errors.number)}
            helperText={errors.number?.message}
            sx={fieldSx}
          />
        )}
      />
    </FormPaper>
  );
}
