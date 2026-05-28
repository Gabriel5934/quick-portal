import { zodResolver } from "@hookform/resolvers/zod";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Link as RouterLink } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { newBusinessSchema, step1Schema, step1Fields } from "./schemas";
import { Step1 } from "./Step1";
import { Step2 } from "./Step2";
import type { NewBusinessFormValues } from "./types";

const TOTAL_STEPS = 2;

export function NewBusiness() {
  const [step, setStep] = useState(1);

  // Keeps the resolver scoped to step 1 fields until the user attempts to
  // submit. This prevents _updateValid (fired when new step Controller fields
  // register) from running the full schema and pre-populating errors.
  const submittedRef = useRef(false);

  const resolver = useCallback<Resolver<NewBusinessFormValues>>(
    async (values, context, options) => {
      const schema = submittedRef.current ? newBusinessSchema : step1Schema;
      return (
        zodResolver(schema) as unknown as Resolver<NewBusinessFormValues>
      )(values, context, options);
    },
    [],
  );

  const methods = useForm<NewBusinessFormValues>({
    resolver,
    defaultValues: {
      documentType: "CNPJ",
      document: "",
      razaoSocial: "",
      nomeFantasia: "",
      mcc: "",
      email: "",
      celular: "",
      bankCode: "",
      branch: "",
      branchDigit: "",
      account: "",
      accountDigit: "",
    },
  });

  function handleNext() {
    const values = methods.getValues();
    const result = step1Schema.safeParse(values);
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        methods.setError(issue.path[0] as keyof NewBusinessFormValues, {
          type: "manual",
          message: issue.message,
        });
      });
      return;
    }
    methods.clearErrors(step1Fields);
    setStep((s) => s + 1);
  }

  function onSubmit(data: NewBusinessFormValues) {
    console.log(data);
  }

  function handleSave() {
    submittedRef.current = true;
    void methods.handleSubmit(onSubmit)();
  }

  const isLastStep = step === TOTAL_STEPS;

  return (
    <FormProvider {...methods}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          height: "100%",
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Breadcrumbs aria-label="breadcrumb">
            <Link
              component={RouterLink}
              to="/home"
              underline="hover"
              color="inherit"
            >
              Início
            </Link>
            <Typography color="text.primary" aria-current="page">
              Cadastro de EC
            </Typography>
          </Breadcrumbs>

          <Typography variant="h5">Novo Estabelecimento Comercial</Typography>
          <Typography variant="subtitle1">
            Preencha os dados iniciais para criar o cadastro do EC. Após salvar,
            você poderá completar o credenciamento.
          </Typography>
          <Typography variant="subtitle2">
            Etapa {step} de {TOTAL_STEPS}
          </Typography>
        </Box>

        <Box
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          component="form"
          noValidate
        >
          {step === 1 && <Step1 />}
          {step === 2 && <Step2 />}
        </Box>

        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="outlined" color="error">
              Cancelar
            </Button>
            <Button variant="outlined">Salvar Rascunho</Button>
            <Button
              variant="contained"
              disabled={step === 1}
              onClick={() => setStep((s) => s - 1)}
            >
              Voltar
            </Button>
          </Box>

          {isLastStep ? (
            <Button variant="contained" onClick={handleSave}>
              Salvar
            </Button>
          ) : (
            <Button variant="contained" onClick={handleNext}>
              Próximo
            </Button>
          )}
        </Box>
      </Box>
    </FormProvider>
  );
}
