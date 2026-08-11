import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { useStateMachine } from "little-state-machine";
import {
  FormFieldPaper,
  WizardActions,
} from "../../../components/multi-step-form";
import { useBusinessScope } from "../../../layout/business-context";
import { useRecurringFeeChildren } from "../../../hooks/quickApi/useRecurringFees";
import { targetsSchema, type TargetsValues } from "../schemas";
import { resetRecurringFeeDraft, updateRecurringFeeDraft } from "../form-store";
import { StepForm } from "../step-layout";

export function TargetsStep() {
  const navigate = useNavigate();
  const { business } = useBusinessScope();
  const {
    data: children = [],
    isLoading,
    error,
  } = useRecurringFeeChildren(business?.id);
  const { state, actions } = useStateMachine({
    updateRecurringFeeDraft,
    resetRecurringFeeDraft,
  });
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<TargetsValues>({
    resolver: zodResolver(targetsSchema),
    defaultValues: { targetIds: state.recurringFeeDraft.targetIds },
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
          void navigate({ to: "/recurring-fees/new/review" });
        })(event)
      }
    >
      <FormFieldPaper
        title="Empresas alvo"
        description="Selecione uma ou mais empresas diretamente vinculadas ao perfil atual."
        error={!!errors.targetIds}
        required
      >
        {error ? (
          <Typography color="error">{error.message}</Typography>
        ) : (
          <Controller
            name="targetIds"
            control={control}
            render={({ field }) => (
              <Autocomplete
                multiple
                options={children}
                loading={isLoading}
                value={children.filter((item) => field.value.includes(item.id))}
                onChange={(_, selected) =>
                  field.onChange(selected.map((item) => item.id))
                }
                isOptionEqualToValue={(option, value) => option.id === value.id}
                getOptionLabel={(option) => option.trade_name || option.name}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    variant="standard"
                    label="Empresas"
                    error={!!errors.targetIds}
                    helperText={errors.targetIds?.message}
                  />
                )}
              />
            )}
          />
        )}
        {!isLoading && children.length === 0 && !error && (
          <Typography color="text.secondary">
            Este perfil não possui empresas filhas disponíveis.
          </Typography>
        )}
      </FormFieldPaper>
      <WizardActions
        onCancel={cancel}
        onBack={() => void navigate({ to: "/recurring-fees/new/schedule" })}
      />
    </StepForm>
  );
}
