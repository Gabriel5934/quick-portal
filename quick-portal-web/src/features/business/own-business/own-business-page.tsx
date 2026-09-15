import { zodResolver } from "@hookform/resolvers/zod";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { FormProvider, useForm } from "react-hook-form";
import { useOwnBusiness } from "#hooks/quickApi/useOwnBusiness";
import {
  MultiStepFormShell,
  WizardActions,
} from "../../../components/multi-step-form";
import { AddressStep } from "./address-step";
import { BankStep } from "./bank-step";
import { OwnRegistrationStep } from "./own-registration-step";
import { OwnBusinessReviewStep } from "./review-step";
import {
  addressSchema,
  bankSchema,
  commercialPlanSchema,
  ownBusinessSchema,
} from "./schemas";
import type { OwnBusinessFormValues } from "./types";
import { useState } from "react";

const steps = [
  "Dados bancários",
  "Endereço",
  "Dados do credenciamento",
  "Revisão",
] as const;
const validationSchemas = [
  bankSchema,
  addressSchema,
  commercialPlanSchema,
] as const;

export function OwnBusiness({ businessId }: { businessId: number }) {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();
  const ownBusiness = useOwnBusiness();
  const methods = useForm<OwnBusinessFormValues>({
    resolver: zodResolver(ownBusinessSchema),
    defaultValues: {
      bankCode: "",
      branch: "",
      branchDigit: "",
      account: "",
      accountDigit: "",
      postalCode: "",
      state: "",
      city: "",
      neighborhood: "",
      street: "",
      number: "",
      complement: "",
      planId: undefined,
      activityId: undefined,
      signatoryName: "",
      signatoryCpf: "",
      signatoryEmail: "",
      expectedRevenue: "",
      commitedRevenue: "",
      quantityPos: undefined,
    },
  });

  function applyValidationErrors(
    issues: { path: PropertyKey[]; message: string }[],
  ) {
    issues.forEach((issue) =>
      methods.setError(
        issue.path.join(".") as Parameters<typeof methods.setError>[0],
        { type: "manual", message: issue.message },
      ),
    );
  }

  function advance() {
    const schema = validationSchemas[currentStep];
    if (!schema) return;
    const result = schema.safeParse(methods.getValues());
    if (!result.success) {
      applyValidationErrors(result.error.issues);
      return;
    }
    methods.clearErrors();
    setCurrentStep((step) => step + 1);
  }

  function submit(values: OwnBusinessFormValues) {
    ownBusiness.mutate(
      { businessId, ...values },
      {
        onSuccess: () => void navigate({ to: "/business-list" }),
        onError: (error) =>
          methods.setError("root", { message: error.message }),
      },
    );
  }

  return (
    <FormProvider {...methods}>
      <MultiStepFormShell
        breadcrumb={{ to: "/business-list", label: "Estabelecimentos" }}
        currentLabel="Credenciamento OWN"
        title="Credenciamento OWN do EC"
        subtitle="Informe os dados bancários, o endereço e as condições comerciais para credenciar o estabelecimento na OWN."
        steps={steps}
        currentStep={currentStep}
      >
        <Stack
          component="form"
          noValidate
          spacing={2}
          onSubmit={(event) => {
            if (currentStep < steps.length - 1) {
              event.preventDefault();
              advance();
              return;
            }
            void methods.handleSubmit(submit)(event);
          }}
        >
          {currentStep === 0 && <BankStep />}
          {currentStep === 1 && <AddressStep />}
          {currentStep === 2 && <OwnRegistrationStep />}
          {currentStep === 3 && (
            <OwnBusinessReviewStep values={methods.getValues()} />
          )}
          {methods.formState.errors.root && (
            <Typography color="error">
              {methods.formState.errors.root.message}
            </Typography>
          )}
          <WizardActions
            onCancel={() => void navigate({ to: "/business-list" })}
            onBack={
              currentStep > 0
                ? () => setCurrentStep((step) => step - 1)
                : undefined
            }
            submitLabel={
              currentStep === steps.length - 1
                ? "Finalizar credenciamento"
                : "Continuar"
            }
            loading={currentStep === steps.length - 1 && ownBusiness.isPending}
          />
        </Stack>
      </MultiStepFormShell>
    </FormProvider>
  );
}
