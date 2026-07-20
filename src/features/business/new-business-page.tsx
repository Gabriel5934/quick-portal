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
import { step1Schema } from "./schemas";
import { Step1 } from "./Step1";
import type { NewBusinessFormValues } from "./types";

export function NewBusiness() {
  const navigate = useNavigate();
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
      documentType: "CPF",
      document: "",
      name: "",
      nomeFantasia: "",
      codCnae: "",
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
    void methods.trigger("document");
  }, [cnpjError, methods]);

  function onSubmit(data: NewBusinessFormValues) {
    createBusiness(data, {
      onSuccess: () => {
        void navigate({ to: "/home" });
      },
      onError: (err) => {
        methods.setError("root", { message: err.message });
      },
    });
  }

  return (
    <FormProvider {...methods}>
      <FormPage
        breadcrumbs={[{ to: "/home", label: "Início" }]}
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
            onClick={() => void navigate({ to: "/home" })}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            loading={isPending}
            onClick={methods.handleSubmit(onSubmit)}
          >
            Salvar
          </Button>
        </Box>
      </FormPage>
    </FormProvider>
  );
}
