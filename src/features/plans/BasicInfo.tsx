import Alert from "@mui/material/Alert";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import InfoIcon from "@mui/icons-material/Info";
import { Controller, useFormContext } from "react-hook-form";
import { FormPaper } from "../business/FormPaper";
import type { NewPlanFormValues } from "./schemas";

const fieldSx = { flexGrow: 1, flexShrink: 1, flexBasis: "360px" };

export function BasicInfo() {
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = useFormContext<NewPlanFormValues>();

  const anticipation = watch("anticipation");

  return (
    <FormPaper
      title="Informações Básicas"
      subtitle="Dados gerais do plano comercial"
      Icon={InfoIcon}
    >
      <TextField
        {...register("name")}
        label="Nome"
        required
        error={Boolean(errors.name)}
        helperText={errors.name?.message}
        sx={fieldSx}
      />

      <TextField
        {...register("description")}
        label="Descrição"
        multiline
        minRows={2}
        error={Boolean(errors.description)}
        helperText={errors.description?.message}
        sx={{ flexBasis: "100%" }}
      />

      <Controller
        name="split"
        control={control}
        render={({ field: { value, onChange, ref } }) => (
          <FormControlLabel
            control={
              <Switch
                checked={value}
                onChange={(e) => onChange(e.target.checked)}
                ref={ref}
              />
            }
            label="Split"
            sx={{ flexBasis: "200px" }}
          />
        )}
      />

      <Controller
        name="anticipation"
        control={control}
        render={({ field: { value, onChange, ref } }) => (
          <FormControlLabel
            control={
              <Switch
                checked={value}
                onChange={(e) => onChange(e.target.checked)}
                ref={ref}
              />
            }
            label="Antecipação"
            sx={{ flexBasis: "200px" }}
          />
        )}
      />

      <Alert
        severity={anticipation ? "success" : "info"}
        sx={{ flexBasis: "100%" }}
      >
        {anticipation
          ? "Com antecipação ativa, os pagamentos são processados em 1 dia útil."
          : "Sem antecipação, os pagamentos são processados em 30 dias."}
      </Alert>
    </FormPaper>
  );
}
