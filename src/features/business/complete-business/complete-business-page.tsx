import { zodResolver } from "@hookform/resolvers/zod";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { FormProvider, useForm } from "react-hook-form";
import { useCompleteBusiness } from "#hooks/quickApi/useCompleteBusiness";
import { useBusiness } from "#hooks/quickApi/useBusinesses";
import {
  MultiStepFormShell,
  WizardActions,
} from "../../../components/multi-step-form";
import { AddressStep } from "./address-step";
import { BankStep } from "./bank-step";
import { CommercialPlanStep } from "./commercial-plan-step";
import { PosDevicesStep } from "./pos-devices-step";
import { CompleteBusinessReviewStep } from "./review-step";
import {
  addressSchema,
  bankSchema,
  commercialPlanSchema,
  completeBusinessSchema,
  posDevicesSchema,
} from "./schemas";
import type { CompleteBusinessFormValues } from "./types";
import { useState } from "react";

const steps = [
  "Dados bancários",
  "Endereço",
  "Terminais",
  "Plano comercial",
  "Revisão",
] as const;
const validationSchemas = [
  bankSchema,
  addressSchema,
  posDevicesSchema,
  commercialPlanSchema,
] as const;

export function CompleteBusiness({
  id,
  acquirerId,
}: {
  id?: number;
  acquirerId: number;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();
  const completeBusiness = useCompleteBusiness();
  const { data: business, isLoading: businessLoading } = useBusiness(id);
  const methods = useForm<CompleteBusinessFormValues>({
    resolver: zodResolver(completeBusinessSchema),
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
      posDevices: [{ model: "", serialNumber: "" }],
      acquirerId,
      planId: undefined,
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

  function submit(values: CompleteBusinessFormValues) {
    completeBusiness.mutate(
      { id: id ?? 0, ...values },
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
        currentLabel="Completar cadastro"
        title="Completar Cadastro do EC"
        subtitle="Complete os dados bancários, endereço, terminais e plano comercial."
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
          {currentStep === 2 && <PosDevicesStep />}
          {currentStep === 3 && (
            <CommercialPlanStep
              businessCnae={business?.cnae}
              isBusinessLoading={businessLoading}
            />
          )}
          {currentStep === 4 && (
            <CompleteBusinessReviewStep values={methods.getValues()} />
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
                ? "Finalizar cadastro"
                : "Continuar"
            }
            loading={
              currentStep === steps.length - 1 && completeBusiness.isPending
            }
          />
        </Stack>
      </MultiStepFormShell>
    </FormProvider>
  );
}
