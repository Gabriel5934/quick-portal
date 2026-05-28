import { zodResolver } from "@hookform/resolvers/zod";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Link as RouterLink } from "@tanstack/react-router";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { newBusinessSchema, step1Fields, step2Fields } from "./schemas";
import { Step1 } from "./Step1";
import { Step2 } from "./Step2";
import type { NewBusinessFormValues } from "./types";

const TOTAL_STEPS = 2;

export function NewBusiness() {
  const [step, setStep] = useState(1);

  const methods = useForm<NewBusinessFormValues>({
    resolver: zodResolver(newBusinessSchema),
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

  async function handleNext() {
    let fieldsToValidate: (keyof NewBusinessFormValues)[] = [];
    if (step === 1) fieldsToValidate = step1Fields;
    if (step === 2) fieldsToValidate = step2Fields;

    // TODO fields are validating right as step loads
    const ok = await methods.trigger(fieldsToValidate);
    if (ok) setStep((s) => s + 1);
  }

  function onSubmit(data: NewBusinessFormValues) {
    console.log(data);
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
          id="new-business-form"
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          component="form"
          onSubmit={(e) => {
            void methods.handleSubmit(onSubmit)(e);
          }}
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
            <Button variant="contained" type="submit" form="new-business-form">
              Salvar
            </Button>
          ) : (
            <Button variant="contained" onClick={() => void handleNext()}>
              Próximo
            </Button>
          )}
        </Box>
      </Box>
    </FormProvider>
  );
}
