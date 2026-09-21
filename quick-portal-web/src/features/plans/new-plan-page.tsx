import { zodResolver } from "@hookform/resolvers/zod";
import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { useBasketAnticipation } from "#hooks/quickApi/useBasketAnticipation";
import { useCreatePlan } from "#hooks/quickApi/useCreatePlan";
import { useOwnFees } from "#hooks/quickApi/useOwnFees";
import { useAllBusinesses } from "#hooks/quickApi/useBusinesses";
import { useBusinessScope } from "../../layout/business-context";
import { FormPage } from "../../layout/form-page";
import { BasicInfo } from "./BasicInfo";
import { Fees } from "./Fees";
import { basketFees, buildPlanFees } from "./catalog";
import { newPlanSchema, type NewPlanFormValues } from "./schemas";

export function NewPlan({ ownerBusinessId }: { ownerBusinessId?: number }) {
  const navigate = useNavigate();
  const { business } = useBusinessScope();
  const businessId = ownerBusinessId ?? business?.id;
  const { data: businesses = [] } = useAllBusinesses();
  const ownerBusiness = businesses.find((item) => item.id === businessId);
  const { mutate: createPlan, isPending } = useCreatePlan(businessId);
  const { data: catalog } = useOwnFees();
  const methods = useForm<NewPlanFormValues>({
    resolver: zodResolver(newPlanSchema),
    defaultValues: {
      title: "",
      description: "",
      anticipation_type: "None",
      markups: {},
      defaults: {},
    },
  });
  const basketId = useWatch({ control: methods.control, name: "basketId" });
  const anticipation = useBasketAnticipation(basketId);

  function onSubmit(values: NewPlanFormValues) {
    if (!businessId || !catalog) {
      methods.setError("root", { message: "Selecione uma empresa e carregue as taxas antes de salvar." });
      return;
    }
    const fees = basketFees(catalog, values.basketId);
    if (fees.length === 0) {
      methods.setError("root", { message: "Não foram encontradas taxas para esta cesta." });
      return;
    }
    if (values.anticipation_type === "Rotating" && !anticipation.data) {
      methods.setError("root", { message: "Carregue a taxa de antecipação antes de salvar." });
      return;
    }
    const { entries, missing } = buildPlanFees(fees, values.markups, values.defaults);
    if (missing.length > 0) {
      methods.setError("root", {
        message: `Informe acréscimos válidos para todas as taxas (${missing.length} pendentes). Primeira: ${missing[0]}.`,
      });
      return;
    }
    createPlan({
      title: values.title,
      description: values.description,
      anticipation_type: values.anticipation_type,
      activity: values.activity,
      basketId: values.basketId,
      fees: entries,
    }, {
      onSuccess: () => void navigate({ to: "/planos-e-taxas" }),
      onError: (error) => methods.setError("root", { message: error.message }),
    });
  }

  return (
    <FormProvider {...methods}>
      <FormPage
        breadcrumbs={[{ to: "/planos-e-taxas", label: "Planos e Taxas" }]}
        currentLabel="Novo Plano"
        title="Novo Plano"
        subtitle={`Configure os acréscimos das taxas OWN${ownerBusiness ? ` para ${ownerBusiness.name}` : ""}.`}
      >
        <Box component="form" noValidate onSubmit={(event) => void methods.handleSubmit(onSubmit)(event)} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <BasicInfo />
          <Fees />
          {methods.formState.errors.root && (
            <Typography color="error">{methods.formState.errors.root.message}</Typography>
          )}
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Button variant="outlined" color="error" onClick={() => void navigate({ to: "/planos-e-taxas" })}>Cancelar</Button>
            <Button type="submit" variant="contained" loading={isPending} disabled={!businessId}>Salvar</Button>
          </Box>
        </Box>
      </FormPage>
    </FormProvider>
  );
}
