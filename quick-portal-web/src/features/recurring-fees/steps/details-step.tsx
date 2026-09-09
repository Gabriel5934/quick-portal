import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { useStateMachine } from "little-state-machine";
import {
  CurrencyField,
  FormFieldPaper,
  WizardActions,
} from "../../../components/multi-step-form";
import { detailsSchema, type DetailsValues } from "../schemas";
import { resetRecurringFeeDraft, updateRecurringFeeDraft } from "../form-store";
import { StepForm } from "../step-layout";

export function DetailsStep() {
  const navigate = useNavigate();
  const { state, actions } = useStateMachine({
    updateRecurringFeeDraft,
    resetRecurringFeeDraft,
  });
  const draft = state.recurringFeeDraft;
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: draft,
  });
  const cancel = () => {
    actions.resetRecurringFeeDraft();
    void navigate({ to: "/recurring-fees" });
  };

  return (
    <StepForm
      onSubmit={(event) =>
        void handleSubmit((values) => {
          actions.updateRecurringFeeDraft(values);
          void navigate({ to: "/recurring-fees/new/pricing" });
        })(event)
      }
    >
      <FormFieldPaper
        title="Nome"
        description="Identifique esta cobrança para a sua equipe."
        error={!!errors.name}
        required
      >
        <TextField
          variant="standard"
          label="Nome"
          fullWidth
          {...register("name")}
          error={!!errors.name}
          helperText={errors.name?.message}
        />
      </FormFieldPaper>
      <FormFieldPaper
        title="Descrição"
        description="Explique o motivo e as condições da taxa."
        error={!!errors.description}
      >
        <TextField
          variant="standard"
          label="Descrição"
          multiline
          fullWidth
          {...register("description")}
          error={!!errors.description}
          helperText={errors.description?.message}
        />
      </FormFieldPaper>
      <FormFieldPaper
        title="Valor de adesão"
        description="Cobrado uma única vez, na primeira cobrança bem-sucedida de cada empresa."
        error={!!errors.setupValue}
        required
      >
        <Controller
          name="setupValue"
          control={control}
          render={({ field }) => (
            <CurrencyField
              label="Valor de adesão"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.setupValue}
              helperText={errors.setupValue?.message}
            />
          )}
        />
      </FormFieldPaper>
      <FormFieldPaper
        title="Status"
        description="Uma taxa inativa permanece configurada, mas não fica elegível para cobrança."
      >
        <Controller
          name="active"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={
                <Switch
                  checked={field.value}
                  onChange={(_, checked) => field.onChange(checked)}
                />
              }
              label={field.value ? "Ativa" : "Inativa"}
            />
          )}
        />
      </FormFieldPaper>
      <WizardActions onCancel={cancel} />
    </StepForm>
  );
}
