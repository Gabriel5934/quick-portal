import TextField from "@mui/material/TextField";
import { Controller, useFormContext } from "react-hook-form";
import { PatternFormat } from "react-number-format";
import { FormFieldPaper } from "../../../components/multi-step-form";
import type { NewBusinessFormValues } from "./types";

export function ContactStep() {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<NewBusinessFormValues>();

  return (
    <>
      <FormFieldPaper
        title="Email"
        description="Informe o endereço de email do estabelecimento."
        error={Boolean(errors.email)}
        required
      >
        <TextField
          {...register("email")}
          type="email"
          variant="standard"
          label="Email"
          fullWidth
          required
          error={Boolean(errors.email)}
          helperText={errors.email?.message}
        />
      </FormFieldPaper>

      <FormFieldPaper
        title="Celular"
        description="Informe o número de celular principal."
        error={Boolean(errors.celular)}
        required
      >
        <Controller
          name="celular"
          control={control}
          render={({ field: { ref, onChange, value, ...field } }) => (
            <PatternFormat
              {...field}
              value={value}
              format="(##) #####-####"
              onValueChange={(values) => onChange(values.formattedValue)}
              customInput={TextField}
              getInputRef={ref}
              variant="standard"
              label="Celular"
              fullWidth
              required
              error={Boolean(errors.celular)}
              helperText={errors.celular?.message}
            />
          )}
        />
      </FormFieldPaper>

      <FormFieldPaper
        title="Telefone"
        description="Informe um telefone fixo, se houver."
        error={Boolean(errors.telefone)}
      >
        <Controller
          name="telefone"
          control={control}
          render={({ field: { ref, onChange, value, ...field } }) => (
            <PatternFormat
              {...field}
              value={value}
              format="(##) ####-####"
              onValueChange={(values) => onChange(values.formattedValue)}
              customInput={TextField}
              getInputRef={ref}
              variant="standard"
              label="Telefone"
              fullWidth
              error={Boolean(errors.telefone)}
              helperText={errors.telefone?.message}
            />
          )}
        />
      </FormFieldPaper>
    </>
  );
}
