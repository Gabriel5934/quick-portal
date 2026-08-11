import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStateMachine } from "little-state-machine";
import { MultiStepFormShell } from "../../components/multi-step-form";
import { useBusinessScope } from "../../layout/business-context";
import { resetRecurringFeeDraft, updateRecurringFeeDraft } from "./form-store";
import {
  detailsSchema,
  pricingSchema,
  scheduleSchema,
  targetsSchema,
} from "./schemas";
import { recurringFeeStepPaths, recurringFeeSteps } from "./wizard-definition";

export function RecurringFeeWizardPage({
  currentStep,
  children,
}: {
  currentStep: number;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { business } = useBusinessScope();
  const { state, actions } = useStateMachine({
    resetRecurringFeeDraft,
    updateRecurringFeeDraft,
  });

  useEffect(() => {
    if (!business || state.recurringFeeDraft.ownerId === business.id) return;
    actions.resetRecurringFeeDraft();
    actions.updateRecurringFeeDraft({ ownerId: business.id });
    if (currentStep > 0) {
      void navigate({ to: "/recurring-fees/new/details", replace: true });
    }
  }, [
    actions,
    business,
    currentStep,
    navigate,
    state.recurringFeeDraft.ownerId,
  ]);

  useEffect(() => {
    const draft = state.recurringFeeDraft;
    if (!business || draft.ownerId !== business.id || currentStep === 0) return;
    const completed = [
      detailsSchema.safeParse(draft).success,
      pricingSchema.safeParse(draft).success,
      scheduleSchema.safeParse(draft).success,
      targetsSchema.safeParse(draft).success,
    ];
    const earliestIncomplete = completed.findIndex((value) => !value);
    if (earliestIncomplete >= 0 && currentStep > earliestIncomplete) {
      void navigate({
        to: recurringFeeStepPaths[earliestIncomplete],
        replace: true,
      });
    }
  }, [business, currentStep, navigate, state.recurringFeeDraft]);

  return (
    <MultiStepFormShell
      title="Nova taxa recorrente"
      subtitle={`Configure a cobrança para ${business?.trade_name || business?.name || "o perfil selecionado"}.`}
      steps={recurringFeeSteps}
      currentStep={currentStep}
    >
      {children}
    </MultiStepFormShell>
  );
}
