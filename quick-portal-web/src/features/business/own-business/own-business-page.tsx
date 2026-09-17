import { zodResolver } from "@hookform/resolvers/zod";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { createLink, useNavigate } from "@tanstack/react-router";
import { FormProvider, useForm } from "react-hook-form";
import {
  useOwnBusiness,
  useRetryOwnBusiness,
  useUpdateOwnBusiness,
} from "#hooks/quickApi/useOwnBusiness";
import {
  useOwnBusinessForBusiness,
  type OwnBusinessDetails,
} from "#hooks/quickApi/useOwnBusinesses";
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
const RouterButton = createLink(Button);

function formatCurrency(value: string): string {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function savedValues(ownBusiness: OwnBusinessDetails): OwnBusinessFormValues {
  return {
    bankCode: ownBusiness.bank_code,
    branch: ownBusiness.bank_branch,
    branchDigit: ownBusiness.bank_branch_digit,
    account: ownBusiness.bank_account,
    accountDigit: ownBusiness.bank_account_digit,
    postalCode: ownBusiness.postal_code.replace(/(\d{5})(\d{3})/, "$1-$2"),
    state: ownBusiness.state,
    city: ownBusiness.city,
    neighborhood: ownBusiness.neighborhood,
    street: ownBusiness.street,
    number: ownBusiness.address_number,
    complement: ownBusiness.address_complement,
    planId: ownBusiness.plan,
    signatoryName: ownBusiness.signatory_name,
    signatoryCpf: ownBusiness.signatory_cpf.replace(
      /(\d{3})(\d{3})(\d{3})(\d{2})/,
      "$1.$2.$3-$4",
    ),
    signatoryEmail: ownBusiness.signatory_email,
    expectedRevenue: formatCurrency(ownBusiness.forecast_revenue),
    commitedRevenue: formatCurrency(ownBusiness.contract_revenue),
    quantityPos: ownBusiness.pos_quantity,
  };
}

function OwnBusinessForm({
  businessId,
  savedBusiness,
}: {
  businessId: number;
  savedBusiness: OwnBusinessDetails | null;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();
  const ownBusiness = useOwnBusiness();
  const updateOwnBusiness = useUpdateOwnBusiness();
  const retryOwnBusiness = useRetryOwnBusiness();
  const methods = useForm<OwnBusinessFormValues>({
    resolver: zodResolver(ownBusinessSchema),
    defaultValues: savedBusiness
      ? savedValues(savedBusiness)
      : {
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

  async function submit(values: OwnBusinessFormValues) {
    try {
      if (savedBusiness) {
        const changedFields = Object.keys(
          methods.formState.dirtyFields,
        ) as (keyof OwnBusinessFormValues)[];
        if (changedFields.length > 0) {
          await updateOwnBusiness.mutateAsync({
            id: savedBusiness.id,
            businessId,
            values,
            changedFields,
          });
        }
        await retryOwnBusiness.mutateAsync({
          id: savedBusiness.id,
          businessId,
        });
      } else {
        await ownBusiness.mutateAsync({ businessId, ...values });
      }
      await navigate({
        to: "/business-list/$id",
        params: { id: String(businessId) },
      });
    } catch (error) {
      methods.setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "Erro ao credenciar o estabelecimento na OWN.",
      });
    }
  }

  return (
    <FormProvider {...methods}>
      <MultiStepFormShell
        breadcrumb={{ to: "/business-list", label: "Estabelecimentos" }}
        currentLabel="Credenciamento OWN"
        title={
          savedBusiness
            ? "Revisar credenciamento OWN"
            : "Credenciamento OWN do EC"
        }
        subtitle={
          savedBusiness
            ? "Revise os dados do credenciamento antes de reenviar à OWN."
            : "Informe os dados bancários, o endereço e as condições comerciais para credenciar o estabelecimento na OWN."
        }
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
            onCancel={() =>
              void navigate({
                to: "/business-list/$id",
                params: { id: String(businessId) },
              })
            }
            onBack={
              currentStep > 0
                ? () => setCurrentStep((step) => step - 1)
                : undefined
            }
            submitLabel={
              currentStep === steps.length - 1
                ? savedBusiness
                  ? "Reenviar à OWN"
                  : "Finalizar credenciamento"
                : "Continuar"
            }
            loading={
              currentStep === steps.length - 1 &&
              (ownBusiness.isPending ||
                updateOwnBusiness.isPending ||
                retryOwnBusiness.isPending)
            }
          />
        </Stack>
      </MultiStepFormShell>
    </FormProvider>
  );
}

export function OwnBusiness({ businessId }: { businessId: number }) {
  const {
    data: savedBusiness,
    isLoading,
    error,
  } = useOwnBusinessForBusiness(businessId);

  if (error) {
    return (
      <Alert severity="error">
        {error instanceof Error
          ? error.message
          : "Erro ao carregar o credenciamento OWN."}
      </Alert>
    );
  }

  if (isLoading || savedBusiness === undefined) {
    return <CircularProgress aria-label="Carregando credenciamento OWN" />;
  }

  if (
    savedBusiness &&
    savedBusiness.registration_status !== "API_REQUEST_FAILED"
  ) {
    return (
      <Alert severity="info">
        Este credenciamento não pode ser reenviado no momento. Consulte seu
        status nos detalhes do estabelecimento.{" "}
        <RouterButton
          to="/business-list/$id"
          params={{ id: String(businessId) }}
          size="small"
        >
          Ver detalhes
        </RouterButton>
      </Alert>
    );
  }

  return (
    <OwnBusinessForm
      key={savedBusiness?.id ?? "new"}
      businessId={businessId}
      savedBusiness={savedBusiness}
    />
  );
}
