import { zodResolver } from "@hookform/resolvers/zod";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Link as RouterLink } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import {
  newBusinessSchema,
  step1Schema,
  step1Fields,
  step2Schema,
  step2Fields,
  step3Schema,
  step3Fields,
} from "./schemas";
import { Step1 } from "./Step1";
import { Step2 } from "./Step2";
import { Step3 } from "./Step3";
import { Step4 } from "./Step4";
import type { NewBusinessFormValues } from "./types";

const TOTAL_STEPS = 4;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const methods = useForm<NewBusinessFormValues>({
    resolver,
    defaultValues: {
      documentType: "CPF",
      document: "528-097-868-01",
      razaoSocial: "Gabriel",
      nomeFantasia: "Gabriel",
      mcc: "4814",
      email: "gabriel@gmail.com",
      celular: "51999999999",
      bankCode: "102",
      branch: "1234",
      branchDigit: "5",
      account: "123456",
      accountDigit: "7",
      postalCode: "12244867",
      state: "",
      city: "",
      neighborhood: "",
      street: "",
      number: "82",
      posDevices: [{ model: "", serialNumber: "" }],
    },
  });

  function handleNext() {
    const values = methods.getValues();
    const schema =
      step === 1 ? step1Schema : step === 2 ? step2Schema : step3Schema;
    const fields =
      step === 1 ? step1Fields : step === 2 ? step2Fields : step3Fields;
    const result = schema.safeParse(values);
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        methods.setError(issue.path[0] as keyof NewBusinessFormValues, {
          type: "manual",
          message: issue.message,
        });
      });
      return;
    }
    methods.clearErrors(fields);
    setStep((s) => s + 1);
  }

  function onSubmit(data: NewBusinessFormValues) {
    console.log(data);
  }

  function handleSave() {
    submittedRef.current = true;
    const values = methods.getValues();
    const result = newBusinessSchema.safeParse(values);
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        methods.setError(
          issue.path.join(".") as Parameters<typeof methods.setError>[0],
          { type: "manual", message: issue.message },
        );
      });
      return;
    }
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
          {step === 3 && <Step3 />}
          {step === 4 && <Step4 />}
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
