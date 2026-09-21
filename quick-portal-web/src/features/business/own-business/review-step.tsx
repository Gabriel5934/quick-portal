import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useBanks } from "#hooks/brasilApi/useBanks";
import { useOwnPlansForSignup } from "#hooks/quickApi/useOwnPlans";
import { FormFieldPaper } from "../../../components/multi-step-form";
import type { OwnBusinessFormValues } from "./types";

interface OwnBusinessReviewStepProps {
  businessId: number;
  values: OwnBusinessFormValues;
}

function ReviewItem({
  label,
  value,
}: {
  label: string;
  value?: string | number;
}) {
  return (
    <Typography>
      <strong>{label}:</strong> {value || "—"}
    </Typography>
  );
}

export function OwnBusinessReviewStep({ businessId, values }: OwnBusinessReviewStepProps) {
  const { data: banks = [] } = useBanks();
  const { data: plans = [] } = useOwnPlansForSignup(businessId);
  const bank = banks.find((item) => String(item.code) === values.bankCode);
  const plan = plans.find((item) => item.id === values.planId);

  return (
    <>
      <FormFieldPaper title="Dados bancários">
        <Stack divider={<Divider flexItem />} spacing={1}>
          <ReviewItem
            label="Banco"
            value={bank ? `${bank.code} - ${bank.name}` : values.bankCode}
          />
          <ReviewItem
            label="Agência"
            value={`${values.branch}-${values.branchDigit}`}
          />
          <ReviewItem
            label="Conta"
            value={`${values.account}-${values.accountDigit}`}
          />
        </Stack>
      </FormFieldPaper>
      <FormFieldPaper title="Endereço">
        <Stack divider={<Divider flexItem />} spacing={1}>
          <ReviewItem label="CEP" value={values.postalCode} />
          <ReviewItem
            label="Endereço"
            value={`${values.street}, ${values.number}${values.complement ? ` - ${values.complement}` : ""}`}
          />
          <ReviewItem
            label="Localidade"
            value={`${values.neighborhood}, ${values.city} - ${values.state}`}
          />
        </Stack>
      </FormFieldPaper>
      <FormFieldPaper title="Responsável pela assinatura">
        <Stack divider={<Divider flexItem />} spacing={1}>
          <ReviewItem label="Nome" value={values.signatoryName} />
          <ReviewItem label="CPF" value={values.signatoryCpf} />
          <ReviewItem label="E-mail" value={values.signatoryEmail} />
        </Stack>
      </FormFieldPaper>
      <FormFieldPaper title="Plano comercial OWN">
        <Stack divider={<Divider flexItem />} spacing={1}>
          <ReviewItem label="Plano" value={plan?.title} />
          <ReviewItem
            label="Faturamento esperado"
            value={values.expectedRevenue}
          />
          <ReviewItem
            label="Faturamento comprometido"
            value={values.commitedRevenue}
          />
          <ReviewItem label="Quantidade de POS" value={values.quantityPos} />
        </Stack>
      </FormFieldPaper>
    </>
  );
}
