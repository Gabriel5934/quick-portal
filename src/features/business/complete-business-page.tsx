import { zodResolver } from "@hookform/resolvers/zod";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { useCompleteBusiness } from "#hooks/quickApi/useCompleteBusiness";
import { FormPage } from "../../layout/form-page";
import {
  completeBusinessSchema,
  step2Schema,
  step2Fields,
  step3Schema,
  step3Fields,
} from "./schemas";
import { Step2 } from "./Step2";
import { Step3 } from "./Step3";
import { Step4 } from "./Step4";
import type { CompleteBusinessFormValues } from "./types";

const TOTAL_STEPS = 3;

export function CompleteBusiness({ id }: { id?: number }) {
  const navigate = useNavigate();
  const { mutate: completeBusiness } = useCompleteBusiness();
  const [step, setStep] = useState(1);

  const submittedRef = useRef(false);

  const resolver = useCallback<Resolver<CompleteBusinessFormValues>>(
    async (values, context, options) => {
      const schema = submittedRef.current
        ? completeBusinessSchema
        : step2Schema;
      return (
        zodResolver(schema) as unknown as Resolver<CompleteBusinessFormValues>
      )(values, context, options);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const methods = useForm<CompleteBusinessFormValues>({
    resolver,
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
      posDevices: [{ model: "", serialNumber: "" }],
    },
  });

  function handleNext() {
    const values = methods.getValues();
    const schema = step === 1 ? step2Schema : step3Schema;
    const fields = step === 1 ? step2Fields : step3Fields;
    const result = schema.safeParse(values);
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        methods.setError(issue.path[0] as keyof CompleteBusinessFormValues, {
          type: "manual",
          message: issue.message,
        });
      });
      return;
    }
    methods.clearErrors(fields);
    setStep((s) => s + 1);
  }

  function onSubmit(data: CompleteBusinessFormValues) {
    completeBusiness(
      { id: id ?? 0, ...data },
      {
        onSuccess: () => void navigate({ to: "/home" }),
        onError: (err) => methods.setError("root", { message: err.message }),
      },
    );
  }

  function handleSave() {
    submittedRef.current = true;
    const values = methods.getValues();
    const result = completeBusinessSchema.safeParse(values);
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        methods.setError(
          issue.path.join(".") as Parameters<typeof methods.setError>[0],
          { type: "manual", message: issue.message },
        );
      });
      const stepForField = (field: string) => {
        if ((step2Fields as string[]).includes(field)) return 1;
        if ((step3Fields as string[]).includes(field)) return 2;
        return 3;
      };
      const earliest = Math.min(
        ...result.error.issues.map((i) => stepForField(String(i.path[0]))),
      );
      setStep(earliest);
      return;
    }
    void methods.handleSubmit(onSubmit)();
  }

  const isLastStep = step === TOTAL_STEPS;

  return (
    <FormProvider {...methods}>
      <FormPage
        breadcrumbs={[{ to: "/home", label: "Início" }]}
        currentLabel="Completar EC"
        title="Completar Cadastro do EC"
        subtitle="Complete as informações do estabelecimento comercial para finalizar o credenciamento."
        step={{ current: step, total: TOTAL_STEPS }}
      >
        <Box
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          component="form"
          noValidate
        >
          {step === 1 && <Step2 />}
          {step === 2 && <Step3 />}
          {step === 3 && <Step4 />}
        </Box>

        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="outlined"
              color="error"
              onClick={() => void navigate({ to: "/home" })}
            >
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
      </FormPage>
    </FormProvider>
  );
}
