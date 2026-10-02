import Autocomplete from "@mui/material/Autocomplete";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { Controller, useFormContext } from "react-hook-form";
import type { CieloPlanSummary } from "#features/cielo-plans/types";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { useCieloOptions } from "#hooks/quickApi/useCielo";
import { FormFieldPaper } from "../../components/multi-step-form";
import type { CieloBusinessFormValues } from "./types";

export function CieloIdentificationStep({
  business,
  plans,
}: {
  business: Business;
  /** Active plans owned by the business selected in the drawer. */
  plans: CieloPlanSummary[];
}) {
  const {
    control,
    formState: { errors },
  } = useFormContext<CieloBusinessFormValues>();
  const documentType = business.document_type;
  const { data: activities = [] } = useCieloOptions(
    "business-activities",
    documentType === "CPF",
  );

  return (
    <FormFieldPaper
      title="Identificação"
      description="Informe os dados específicos exigidos pela Cielo."
      error={
        !!errors.plan ||
        !!errors.contactName ||
        !!errors.website ||
        !!errors.birthdayDate ||
        !!errors.businessActivityId
      }
      required
    >
      <Stack spacing={2}>
        <Controller
          name="plan"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              select
              label="Plano Cielo"
              required
              error={!!errors.plan}
              helperText={
                errors.plan?.message ??
                "Define a taxa fixa e o MDR do seller. Não pode ser alterado depois."
              }
            >
              {plans.map((plan) => (
                <MenuItem key={plan.id} value={String(plan.id)}>
                  <ListItemText
                    primary={plan.name}
                    secondary={plan.description || undefined}
                  />
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        {documentType === "CPF" ? null : (
          <Controller
            name="contactName"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Nome do contato responsável"
                required
                error={!!errors.contactName}
                helperText={errors.contactName?.message}
              />
            )}
          />
        )}
        <Controller
          name="website"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Website"
              error={!!errors.website}
              helperText={errors.website?.message}
            />
          )}
        />
        {documentType === "CPF" ? (
          <>
            <Controller
              name="birthdayDate"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="date"
                  label="Data de nascimento"
                  required
                  error={!!errors.birthdayDate}
                  helperText={errors.birthdayDate?.message}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              )}
            />
            <Controller
              name="businessActivityId"
              control={control}
              render={({ field: { onChange, value, ref } }) => (
                <Autocomplete
                  options={activities}
                  getOptionLabel={(option) =>
                    `${option.value} - ${option.label}`
                  }
                  isOptionEqualToValue={(option, selected) =>
                    option.value === selected.value
                  }
                  value={
                    activities.find((option) => option.value === value) ?? null
                  }
                  onChange={(_, selected) => onChange(selected?.value ?? "")}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      inputRef={ref}
                      label="Ramo de atividade"
                      required
                      error={!!errors.businessActivityId}
                      helperText={errors.businessActivityId?.message}
                    />
                  )}
                />
              )}
            />
          </>
        ) : null}
      </Stack>
    </FormFieldPaper>
  );
}
