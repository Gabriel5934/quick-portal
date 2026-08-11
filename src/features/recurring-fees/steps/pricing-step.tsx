import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useStateMachine } from "little-state-machine";
import {
  CurrencyField,
  FormFieldPaper,
  WizardActions,
} from "../../../components/multi-step-form";
import { pricingSchema, type PricingValues } from "../schemas";
import { resetRecurringFeeDraft, updateRecurringFeeDraft } from "../form-store";
import { StepForm } from "../step-layout";

export function PricingStep() {
  const navigate = useNavigate();
  const { state, actions } = useStateMachine({
    updateRecurringFeeDraft,
    resetRecurringFeeDraft,
  });
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PricingValues>({
    resolver: zodResolver(pricingSchema),
    defaultValues: state.recurringFeeDraft,
  });
  const mode = useWatch({ control, name: "pricingMode" });
  const cancel = () => {
    actions.resetRecurringFeeDraft();
    void navigate({ to: "/recurring-fees" });
  };

  return (
    <StepForm
      onSubmit={(event) =>
        void handleSubmit((values) => {
          actions.updateRecurringFeeDraft({
            ...values,
            ...(values.pricingMode === "FIXED"
              ? { goalAmount: "", valueBelowGoal: "", valueAtOrAboveGoal: "" }
              : { feeValue: "" }),
          });
          void navigate({ to: "/recurring-fees/new/schedule" });
        })(event)
      }
    >
      <FormFieldPaper
        title="Modelo de cobrança"
        description="Use um valor único ou varie a taxa conforme a meta do período."
        required
      >
        <Controller
          name="pricingMode"
          control={control}
          render={({ field }) => (
            <FormControl>
              <FormLabel>Tipo de valor</FormLabel>
              <RadioGroup row {...field}>
                <FormControlLabel
                  value="FIXED"
                  control={<Radio />}
                  label="Fixo"
                />
                <FormControlLabel
                  value="GOAL"
                  control={<Radio />}
                  label="Baseado em meta"
                />
              </RadioGroup>
            </FormControl>
          )}
        />
      </FormFieldPaper>
      {mode === "FIXED" ? (
        <FormFieldPaper
          title="Valor da taxa"
          error={!!errors.feeValue}
          required
        >
          <Controller
            name="feeValue"
            control={control}
            render={({ field }) => (
              <CurrencyField
                label="Valor"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={!!errors.feeValue}
                helperText={errors.feeValue?.message}
              />
            )}
          />
        </FormFieldPaper>
      ) : (
        <FormFieldPaper
          title="Meta e valores"
          description="A meta considera o volume financeiro processado no período."
          error={
            !!(
              errors.goalAmount ||
              errors.valueBelowGoal ||
              errors.valueAtOrAboveGoal
            )
          }
          required
        >
          <Stack spacing={2}>
            <Controller
              name="goalAmount"
              control={control}
              render={({ field }) => (
                <CurrencyField
                  label="Meta do período"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={!!errors.goalAmount}
                  helperText={errors.goalAmount?.message}
                />
              )}
            />
            <Controller
              name="valueBelowGoal"
              control={control}
              render={({ field }) => (
                <CurrencyField
                  label="Valor abaixo da meta"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={!!errors.valueBelowGoal}
                  helperText={errors.valueBelowGoal?.message}
                />
              )}
            />
            <Controller
              name="valueAtOrAboveGoal"
              control={control}
              render={({ field }) => (
                <CurrencyField
                  label="Valor ao atingir ou superar a meta"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={!!errors.valueAtOrAboveGoal}
                  helperText={errors.valueAtOrAboveGoal?.message}
                />
              )}
            />
          </Stack>
        </FormFieldPaper>
      )}
      <WizardActions
        onCancel={cancel}
        onBack={() => void navigate({ to: "/recurring-fees/new/details" })}
      />
    </StepForm>
  );
}
