import { zodResolver } from "@hookform/resolvers/zod";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import type { FieldErrors } from "react-hook-form";
import { FormProvider, useForm } from "react-hook-form";
import { useCreatePlan } from "#hooks/quickApi/useCreatePlan";
import type { CreatePlanPayload } from "#hooks/quickApi/useCreatePlan";
import { FormPage } from "../../layout/form-page";
import { BasicInfo } from "./BasicInfo";
import { Fees } from "./Fees";
import {
  CARD_NETWORKS,
  INSTALLMENT_TYPES,
  makeBlankFees,
  newPlanSchema,
} from "./schemas";
import type { NewPlanFormValues } from "./schemas";

function percentToDecimal(value: string): string {
  const n = Number(value.replace(",", "."));
  if (Number.isNaN(n)) return "0";
  return (n / 100).toString();
}

function buildFeesPayload(
  values: NewPlanFormValues,
): CreatePlanPayload["fees"] {
  const fees: CreatePlanPayload["fees"] = [];

  for (const network of CARD_NETWORKS) {
    const networkFees = values.fees[network] as Record<
      string,
      { commission: string }
    >;
    for (const paymentType of ["debit", "credit", ...INSTALLMENT_TYPES]) {
      const row = networkFees[paymentType];
      fees.push({
        network,
        payment_type: paymentType,
        commission: percentToDecimal(row.commission),
      });
    }
  }

  const pixRow = values.fees.pix.pix;
  fees.push({
    network: "pix",
    payment_type: "pix",
    commission: percentToDecimal(pixRow.commission),
  });

  return fees;
}

export function NewPlan() {
  const navigate = useNavigate();
  const { mutate: createPlan, isPending } = useCreatePlan();

  const methods = useForm<NewPlanFormValues>({
    resolver: zodResolver(newPlanSchema),
    defaultValues: {
      name: "",
      description: "",
      split: false,
      anticipation: false,
      anticipation_fee: "",
      mccId: undefined,
      fees: makeBlankFees(),
    },
  });

  function onSubmit(data: NewPlanFormValues) {
    const payload: CreatePlanPayload = {
      name: data.name,
      description: data.description,
      split: data.split,
      anticipation: data.anticipation,
      anticipation_fee: data.anticipation
        ? percentToDecimal(data.anticipation_fee || "0")
        : null,
      mcc_id: data.mccId,
      fees: buildFeesPayload(data),
    };

    createPlan(payload, {
      onSuccess: () => void navigate({ to: "/planos-e-taxas" }),
      onError: (err) => methods.setError("root", { message: err.message }),
    });
  }

  function onInvalid(errors: FieldErrors<NewPlanFormValues>) {
    const missing: string[] = [];
    if (errors.name) missing.push("Nome");
    if (errors.mccId) missing.push("MCC");
    if (errors.anticipation_fee) missing.push("Taxa de antecipação");
    if (errors.fees) {
      const networks = Object.keys(errors.fees) as Array<
        keyof NonNullable<typeof errors.fees>
      >;
      for (const n of networks) {
        if (errors.fees[n]) missing.push(`Comissões de ${n}`);
      }
    }
    const detail = missing.length
      ? ` Verifique: ${missing.join(", ")}.`
      : "";
    methods.setError("root", {
      message: `Preencha todos os campos obrigatórios.${detail}`,
    });
  }

  return (
    <FormProvider {...methods}>
      <FormPage
        breadcrumbs={[{ to: "/planos-e-taxas", label: "Planos e Taxas" }]}
        currentLabel="Novo Plano"
        title="Novo Plano"
        subtitle="Preencha as informações do plano e configure as taxas por rede."
      >
        <Box
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          component="form"
          noValidate
        >
          <BasicInfo />
          <Fees />
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
            onClick={() => void navigate({ to: "/planos-e-taxas" })}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            loading={isPending}
            onClick={methods.handleSubmit(onSubmit, onInvalid)}
          >
            Salvar
          </Button>
        </Box>
      </FormPage>
    </FormProvider>
  );
}
