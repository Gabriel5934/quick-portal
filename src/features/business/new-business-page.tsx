import { zodResolver } from "@hookform/resolvers/zod";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { useCreateBusiness } from "#hooks/quickApi/useCreateBusiness";
import { useCnpj } from "#hooks/brasilApi/useCnpj";
import { FormPage } from "../../layout/form-page";
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

  const documentType = methods.watch("documentType");
  const document = methods.watch("document") ?? "";
  const { error: cnpjError } = useCnpj(document, documentType === "CNPJ");

  cnpjErrorRef.current = cnpjError ?? null;

  useEffect(() => {
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
      <FormPage
        breadcrumbs={[{ to: "/business-list", label: "Início" }]}
        currentLabel="Cadastro de EC"
        title="Novo Estabelecimento Comercial"
        subtitle="Preencha os dados iniciais para criar o cadastro do EC. Após salvar, você poderá completar o credenciamento."
      >
        <Box
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          component="form"
          noValidate
        >
          <Step1 />
          {methods.formState.errors.root && (
            <Typography color="error">
              {methods.formState.errors.root.message}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Button
            variant="outlined"
            color="error"
            onClick={() => void navigate({ to: "/business-list" })}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            loading={isPending}
            onClick={() => void methods.handleSubmit(onSubmit)()}
          >
            Salvar
          </Button>
        </Box>
      </FormPage>
    </FormProvider>
  );
}
