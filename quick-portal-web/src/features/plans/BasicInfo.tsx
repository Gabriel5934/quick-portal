import InfoIcon from "@mui/icons-material/Info";
import { Autocomplete, MenuItem, TextField } from "@mui/material";
import { Controller, useFormContext } from "react-hook-form";
import { useOwnActivities } from "#hooks/quickApi/useOwnActivities";
import { FormPaper } from "../business/FormPaper";
import { BASKETS } from "./catalog";
import type { NewPlanFormValues } from "./schemas";

export function BasicInfo() {
  const { data: activities = [], isLoading, error } = useOwnActivities();
  const { register, control, setValue, formState: { errors } } = useFormContext<NewPlanFormValues>();

  return (
    <FormPaper title="Informações Básicas" subtitle="Dados gerais do plano comercial" Icon={InfoIcon}>
      <TextField
        {...register("title")}
        label="Nome"
        required
        error={Boolean(errors.title)}
        helperText={errors.title?.message}
        sx={{ flexGrow: 1, flexBasis: 360 }}
      />
      <TextField
        {...register("description")}
        label="Descrição"
        multiline
        minRows={2}
        sx={{ flexBasis: "100%" }}
      />
      <Controller
        name="activity"
        control={control}
        render={({ field: { value, onChange, ref } }) => (
          <Autocomplete
            options={activities}
            loading={isLoading}
            getOptionLabel={(option) => `${option.cnae} · ${option.description}`}
            isOptionEqualToValue={(option, selected) => option.cnae === selected.cnae}
            value={activities.find((option) => option.cnae === value) ?? null}
            onChange={(_, selected) => onChange(selected?.cnae)}
            sx={{ flexBasis: "100%" }}
            renderInput={(params) => (
              <TextField
                {...params}
                inputRef={ref}
                label="Atividade OWN (CNAE)"
                required
                error={Boolean(errors.activity || error)}
                helperText={errors.activity?.message ?? (error ? "Erro ao carregar atividades." : undefined)}
              />
            )}
          />
        )}
      />
      <Controller
        name="basketId"
        control={control}
        render={({ field: { value, onChange, ref } }) => (
          <TextField
            select
            inputRef={ref}
            label="Cesta"
            value={value ?? ""}
            onChange={(event) => {
              onChange(Number(event.target.value));
              setValue("markups", {});
              setValue("defaults", {});
            }}
            required
            error={Boolean(errors.basketId)}
            helperText={errors.basketId?.message}
            sx={{ flexBasis: "100%" }}
          >
            {BASKETS.map((basket) => (
              <MenuItem key={basket.id} value={basket.id}>{basket.name}</MenuItem>
            ))}
          </TextField>
        )}
      />
    </FormPaper>
  );
}
