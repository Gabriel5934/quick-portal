import { zodResolver } from "@hookform/resolvers/zod";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import type { FieldErrors } from "react-hook-form";
import { FormProvider, useForm } from "react-hook-form";
import { useCreatePlan } from "#hooks/quickApi/useCreatePlan";
import type { CreatePlanPayload } from "#hooks/quickApi/useCreatePlan";
import { useFees } from "#hooks/quickApi/useFees";
import { networkCode, useNetworks } from "#hooks/quickApi/useNetworks";
import { FormPage } from "../../layout/form-page";
import { BasicInfo } from "./BasicInfo";
import { Fees } from "./Fees";
import { newPlanSchema } from "./schemas";
import type { NewPlanFormValues } from "./schemas";

function percentToDecimal(value: string): string {
  const n = Number(value.replace(",", "."));
  if (Number.isNaN(n)) return "0";
  return (n / 100).toString();
}

function buildFeesPayload(
  values: NewPlanFormValues,
  feeCatalog: NonNullable<ReturnType<typeof useFees>["data"]>,
  paymentNetworkCodes: string[],
): { fees: CreatePlanPayload["fees"]; missingFees: string[] } {
  const fees: CreatePlanPayload["fees"] = [];
  const missingFees: string[] = [];

  for (const network of paymentNetworkCodes.filter((code) => code !== "pix")) {
    const networkFees = values.fees[network];
    if (!networkFees || !("debit" in networkFees)) {
      missingFees.push(`${network} (configuração)`);
      continue;
    }
    for (const [installments, row] of [
      [0, networkFees.debit],
      [1, networkFees.credit],
    ] as const) {
      const baseFee = feeCatalog[network][installments];
      if (!baseFee) {
        missingFees.push(
          `${network} ${installments === 0 ? "débito" : "crédito 1x"}`,
        );
        continue;
      }
      fees.push({
        fee: baseFee.id,
        value: percentToDecimal(row.commission),
      });
    }
    for (const row of networkFees.installments) {
      for (
        let installments = row.from;
        installments <= row.to;
        installments++
      ) {
        const baseFee = feeCatalog[network][installments];
        if (!baseFee) {
          missingFees.push(`${network} ${installments}x`);
          continue;
        }
        fees.push({
          fee: baseFee.id,
          value: percentToDecimal(row.commission),
        });
      }
    }
  }

  const pixNetworkFees = values.fees.pix;
  const pixFee = feeCatalog.pix?.[-1];
  if (pixFee && pixNetworkFees && "pix" in pixNetworkFees) {
    fees.push({
      fee: pixFee.id,
      value: percentToDecimal(pixNetworkFees.pix.commission),
    });
  }

  return { fees, missingFees };
}

export function NewPlan() {
  const navigate = useNavigate();
  const { mutate: createPlan, isPending } = useCreatePlan();
  const { data: networkOptions, error: networksError } = useNetworks();

  const methods = useForm<NewPlanFormValues>({
    resolver: zodResolver(newPlanSchema),
    defaultValues: {
      name: "",
      description: "",
      split: false,
      anticipation: false,
      anticipation_fee: "",
      acquirerId: undefined,
      cnae: "",
      fees: {},
    },
  });
  const acquirerId = methods.watch("acquirerId");
  const cnae = methods.watch("cnae");
  const { data: feeCatalog } = useFees(acquirerId, cnae);

  function onSubmit(data: NewPlanFormValues) {
    if (!feeCatalog) {
      methods.setError("root", {
        message: "Carregue as taxas antes de salvar.",
      });
      return;
    }
    if (!networkOptions) {
      methods.setError("root", {
        message: "Carregue as redes de pagamento antes de salvar.",
      });
      return;
    }
    const paymentNetworkCodes = networkOptions
      .map(networkCode)
      .filter((code) => !["acquirer", "default"].includes(code));
    const { fees, missingFees } = buildFeesPayload(
      data,
      feeCatalog,
      paymentNetworkCodes,
    );
    if (missingFees.length > 0) {
      methods.setError("root", {
        message: `Não há taxa base para: ${missingFees.join(", ")}.`,
      });
      return;
    }
    const payload: CreatePlanPayload = {
      name: data.name,
      description: data.description,
      split: data.split,
      anticipation: data.anticipation,
      anticipation_fee: data.anticipation
        ? percentToDecimal(data.anticipation_fee || "0")
        : null,
      cnae: data.cnae,
      fees,
    };

    createPlan(payload, {
      onSuccess: () => void navigate({ to: "/planos-e-taxas" }),
      onError: (err) => methods.setError("root", { message: err.message }),
    });
  }

  function onInvalid(errors: FieldErrors<NewPlanFormValues>) {
    const missing: string[] = [];
    if (errors.name) missing.push("Nome");
    if (errors.acquirerId) missing.push("Adquirente");
    if (errors.cnae) missing.push("CNAE");
    if (errors.anticipation_fee) missing.push("Acréscimo da antecipação");
    if (errors.fees) {
      const networks = Object.keys(errors.fees);
      for (const n of networks) {
        if (errors.fees[n]) missing.push(`Comissões de ${n}`);
      }
    }
    const detail = missing.length ? ` Verifique: ${missing.join(", ")}.` : "";
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
          {networksError && !methods.formState.errors.root && (
            <Typography color="error">
              {networksError instanceof Error
                ? networksError.message
                : "Erro ao carregar redes de pagamento."}
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
            onClick={() => void methods.handleSubmit(onSubmit, onInvalid)()}
          >
            Salvar
          </Button>
        </Box>
      </FormPage>
    </FormProvider>
  );
}
