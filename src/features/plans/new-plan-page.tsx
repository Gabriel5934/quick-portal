import { zodResolver } from "@hookform/resolvers/zod";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
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
  const anticipation = values.anticipation;

  for (const network of CARD_NETWORKS) {
    const networkFees = values.fees[network] as Record<
      string,
      { commission: string; anticipation_fee: string }
    >;
    for (const paymentType of ["debit", "credit", ...INSTALLMENT_TYPES]) {
      const row = networkFees[paymentType];
      fees.push({
        network,
        payment_type: paymentType,
        commission: percentToDecimal(row.commission),
        anticipation_fee: anticipation
          ? percentToDecimal(row.anticipation_fee || "0")
          : null,
      });
    }
  }

  const pixRow = values.fees.pix.pix;
  fees.push({
    network: "pix",
    payment_type: "pix",
    commission: percentToDecimal(pixRow.commission),
    anticipation_fee: anticipation
      ? percentToDecimal(pixRow.anticipation_fee || "0")
      : null,
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
      mcc_id: data.mccId,
      fees: buildFeesPayload(data),
    };

    createPlan(payload, {
      onSuccess: () => void navigate({ to: "/planos-e-taxas" }),
      onError: (err) => methods.setError("root", { message: err.message }),
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
            onClick={methods.handleSubmit(onSubmit)}
          >
            Salvar
          </Button>
        </Box>
      </FormPage>
    </FormProvider>
  );
}
