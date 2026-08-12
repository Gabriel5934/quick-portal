import { zodResolver } from "@hookform/resolvers/zod";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import {
  FormProvider,
  useForm,
  useWatch,
  type Resolver,
} from "react-hook-form";
import { useCreateBusiness } from "#hooks/quickApi/useCreateBusiness";
import { useCnpj } from "#hooks/brasilApi/useCnpj";
import {
  MultiStepFormShell,
  WizardActions,
} from "../../components/multi-step-form";
import { useBusinessScope } from "../../layout/business-context";
import { step1Schema } from "./schemas";
import { Step1 } from "./Step1";
import type { NewBusinessFormValues } from "./types";
import { childBusinessType } from "./business-rules";

export function NewBusiness() {
  const navigate = useNavigate();
  const { business } = useBusinessScope();
  const { mutate: createBusiness, isPending } = useCreateBusiness();

  const cnpjErrorRef = useRef<Error | null>(null);

  const resolver = useMemo<Resolver<NewBusinessFormValues>>(() => {
    const base = zodResolver(step1Schema);
    return async (values, context, options) => {
      const result = await base(values, context, options);
      const err = cnpjErrorRef.current;
      const errors = result.errors as Record<string, unknown>;
      if (err && !errors.document) {
        errors.document = { type: "manual", message: err.message };
      }
      return result;
    };
  }, []);

  const methods = useForm<NewBusinessFormValues>({
    resolver,
    defaultValues: {
      isReseller: false,
      documentType: "CNPJ",
      document: "",
      name: "",
      nomeFantasia: "",
      cnaeId: undefined,
      email: "",
      celular: "",
      telefone: "",
    },
  });

  const documentType = useWatch({
    control: methods.control,
    name: "documentType",
  });
  const document =
    useWatch({ control: methods.control, name: "document" }) ?? "";
  const { error: cnpjError } = useCnpj(document, documentType === "CNPJ");

  useEffect(() => {
    cnpjErrorRef.current = cnpjError ?? null;
    if (documentType !== "CNPJ" || !cnpjError) return;
    void methods.trigger("document");
  }, [cnpjError, documentType, methods]);

  function onSubmit(data: NewBusinessFormValues) {
    if (!business) {
      methods.setError("root", { message: "Selecione um perfil responsável." });
      return;
    }

    createBusiness(
      {
        ...data,
        parentId: business.id,
        type: childBusinessType(business.type, data.isReseller),
      },
      {
        onSuccess: () => {
          void navigate({ to: "/business-list" });
        },
        onError: (err) => {
          methods.setError("root", { message: err.message });
        },
      },
    );
  }

  return (
    <FormProvider {...methods}>
      <MultiStepFormShell
        breadcrumb={{ to: "/business-list", label: "Estabelecimentos" }}
        currentLabel="Cadastro de EC"
        title="Novo Estabelecimento Comercial"
        subtitle="Preencha os dados iniciais para cadastrar o EC. Após salvar, você poderá completar o cadastro."
        steps={["Dados cadastrais"]}
        currentStep={0}
      >
        <Stack
          component="form"
          noValidate
          spacing={2}
          onSubmit={(event) => void methods.handleSubmit(onSubmit)(event)}
        >
          <Step1 />
          {methods.formState.errors.root && (
            <Typography color="error">
              {methods.formState.errors.root.message}
            </Typography>
          )}
          <WizardActions
            onCancel={() => void navigate({ to: "/business-list" })}
            submitLabel="Salvar"
            loading={isPending}
          />
        </Stack>
      </MultiStepFormShell>
    </FormProvider>
  );
}
