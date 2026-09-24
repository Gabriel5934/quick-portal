import { zodResolver } from "@hookform/resolvers/zod";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import { useNavigate } from "@tanstack/react-router";
import { FormProvider, useForm, type FieldPath } from "react-hook-form";
import { useMemo, useState } from "react";
import { useCreateCieloBusiness } from "#hooks/quickApi/useCielo";
import { useBusiness, type Business } from "#hooks/quickApi/useBusinesses";
import {
  MultiStepFormShell,
  WizardActions,
} from "../../components/multi-step-form";
import { CieloAddressStep } from "./address-step";
import { CieloBankAccountStep } from "./bank-account-step";
import { CieloIdentificationStep } from "./identification-step";
import { CieloReviewStep } from "./review-step";
import {
  addressSchema,
  bankAccountSchema,
  createCieloBusinessSchema,
  createIdentificationSchema,
} from "./schemas";
import type { CieloBusinessFormValues } from "./types";
import { isValidCnpj, isValidCpf, normalizeDocument } from "./validators";

const steps = [
  "Identificação",
  "Endereço",
  "Conta bancária",
  "Revisão",
] as const;
export function CieloBusinessPage({ businessId }: { businessId: number }) {
  const businessQuery = useBusiness(businessId);

  if (businessQuery.isPending) {
    return <CircularProgress aria-label="Carregando estabelecimento" />;
  }
  if (businessQuery.isError || !businessQuery.data) {
    return <Alert severity="error">Erro ao carregar o estabelecimento.</Alert>;
  }

  return <CieloBusinessForm business={businessQuery.data} />;
}

function CieloBusinessForm({ business }: { business: Business }) {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();
  const createSeller = useCreateCieloBusiness();
  const businessId = business.id;
  const businessDocument = normalizeDocument(
    business.document,
    business.document_type,
  );
  const isBusinessDocumentValid =
    business.document_type === "CPF"
      ? isValidCpf(businessDocument)
      : isValidCnpj(businessDocument);
  const isBusinessContactValid =
    /^\d{11}$/.test(business.phone) &&
    business.email.length <= 50 &&
    (business.document_type !== "CPF" || business.name.length <= 50);
  const identificationSchema = useMemo(
    () => createIdentificationSchema(business.document_type),
    [business.document_type],
  );
  const cieloBusinessSchema = useMemo(
    () => createCieloBusinessSchema(business.document_type),
    [business.document_type],
  );
  const stepSchemas = useMemo(
    () => [identificationSchema, addressSchema, bankAccountSchema] as const,
    [identificationSchema],
  );
  const methods = useForm<CieloBusinessFormValues>({
    resolver: zodResolver(cieloBusinessSchema),
    defaultValues: {
      contactName: "",
      website: "",
      birthdayDate: "",
      businessActivityId: "",
      corporateName: "",
      fancyName: "",
      addressZipCode: "",
      addressNumber: "",
      addressComplement: "",
      addressStreet: "",
      addressNeighborhood: "",
      addressCity: "",
      addressState: "",
      bank: "",
      bankAccountType: "CheckingAccount",
      bankAccountNumber: "",
      bankAccountVerifierDigit: "",
      bankAgencyNumber: "",
      bankAgencyDigit: "",
      sameBankDocument: false,
      bankDocumentType: "CPF",
      bankDocumentNumber: "",
    },
  });

  function advance() {
    methods.clearErrors();
    if (
      currentStep === 0 &&
      (!isBusinessDocumentValid || !isBusinessContactValid)
    ) {
      methods.setError("root", {
        message:
          "Os dados cadastrais do estabelecimento são inválidos para a Cielo.",
      });
      return;
    }
    const schema = stepSchemas[currentStep];
    if (!schema) return;
    const result = schema.safeParse(methods.getValues());
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const field = issue.path.join(
          ".",
        ) as FieldPath<CieloBusinessFormValues>;
        methods.setError(field, { type: "manual", message: issue.message });
      });
      return;
    }
    setCurrentStep((step) => step + 1);
  }

  async function submit(values: CieloBusinessFormValues) {
    if (!isBusinessDocumentValid || !isBusinessContactValid) {
      methods.setError("root", {
        message:
          "Os dados cadastrais do estabelecimento são inválidos para a Cielo.",
      });
      return;
    }
    try {
      await createSeller.mutateAsync({ businessId, values });
      await navigate({
        to: "/business-list/$id",
        params: { id: String(businessId) },
        search: { tab: "cielo" },
      });
    } catch (error) {
      methods.setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "Erro ao credenciar o estabelecimento na Cielo.",
      });
    }
  }

  return (
    <FormProvider {...methods}>
      <MultiStepFormShell
        breadcrumb={{ to: "/business-list", label: "Estabelecimentos" }}
        currentLabel="Credenciamento Cielo"
        title="Credenciamento Cielo do seller"
        subtitle="Informe os dados de identificação, endereço e conta bancária para enviar o seller à Cielo."
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
          {currentStep === 0 ? (
            <CieloIdentificationStep business={business} />
          ) : null}
          {currentStep === 1 ? <CieloAddressStep /> : null}
          {currentStep === 2 ? (
            <CieloBankAccountStep business={business} />
          ) : null}
          {currentStep === 3 ? (
            <CieloReviewStep values={methods.getValues()} business={business} />
          ) : null}
          {methods.formState.errors.root ? (
            <Alert severity="error">
              {methods.formState.errors.root.message}
            </Alert>
          ) : null}
          <WizardActions
            onCancel={() =>
              void navigate({
                to: "/business-list/$id",
                params: { id: String(businessId) },
                search: { tab: "cielo" },
              })
            }
            onBack={
              currentStep > 0
                ? () => setCurrentStep((step) => step - 1)
                : undefined
            }
            submitLabel={
              currentStep === steps.length - 1 ? "Enviar à Cielo" : "Continuar"
            }
            loading={currentStep === steps.length - 1 && createSeller.isPending}
          />
        </Stack>
      </MultiStepFormShell>
    </FormProvider>
  );
}
