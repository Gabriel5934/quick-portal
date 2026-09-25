import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCieloOptions, cieloRequestData } from "#hooks/quickApi/useCielo";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { FormFieldPaper } from "../../components/multi-step-form";
import type { CieloBusinessFormValues } from "./types";

function ReviewItem({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <Typography>
      <strong>{label}:</strong> {value || "—"}
    </Typography>
  );
}

export function CieloReviewStep({
  values,
  business,
}: {
  values: CieloBusinessFormValues;
  business: Business;
}) {
  const payload = cieloRequestData(values);
  const { data: banks = [] } = useCieloOptions("banks");
  const { data: activities = [] } = useCieloOptions("business-activities");
  const bank = banks.find(
    (option) => option.value === payload.bank_account.bank,
  );
  const activity = activities.find(
    (option) => option.value === payload.business_activity_id,
  );

  return (
    <>
      <FormFieldPaper title="Identificação">
        <Stack divider={<Divider flexItem />} spacing={1}>
          {business.document_type === "CNPJ" ? (
            <ReviewItem label="Contato" value={payload.contact_name} />
          ) : null}
          <ReviewItem label="Website" value={payload.website} />
          {business.document_type === "CPF" ? (
            <>
              <ReviewItem label="Nascimento" value={payload.birthday_date} />
              <ReviewItem
                label="Ramo de atividade"
                value={
                  activity
                    ? `${activity.value} - ${activity.label}`
                    : payload.business_activity_id
                }
              />
            </>
          ) : null}
        </Stack>
      </FormFieldPaper>
      <FormFieldPaper title="Endereço">
        <Stack divider={<Divider flexItem />} spacing={1}>
          <ReviewItem label="CEP" value={payload.address.zip_code} />
          <ReviewItem
            label="Endereço"
            value={`${values.addressStreet}, ${payload.address.number}`}
          />
          <ReviewItem label="Complemento" value={payload.address.complement} />
          <ReviewItem
            label="Localidade"
            value={`${values.addressNeighborhood}, ${values.addressCity} - ${values.addressState}`}
          />
        </Stack>
      </FormFieldPaper>
      <FormFieldPaper title="Conta bancária">
        <Stack divider={<Divider flexItem />} spacing={1}>
          <ReviewItem
            label="Banco"
            value={
              bank ? `${bank.value} - ${bank.label}` : payload.bank_account.bank
            }
          />
          <ReviewItem
            label="Tipo de conta"
            value={payload.bank_account.bank_account_type}
          />
          <ReviewItem
            label="Conta"
            value={`${payload.bank_account.number}-${payload.bank_account.verifier_digit}`}
          />
          <ReviewItem
            label="Agência"
            value={
              payload.bank_account.agency_digit
                ? `${payload.bank_account.agency_number}-${payload.bank_account.agency_digit}`
                : payload.bank_account.agency_number
            }
          />
          <ReviewItem
            label="Documento do titular"
            value={`${payload.bank_account.document_type} ${payload.bank_account.document_number}`}
          />
        </Stack>
      </FormFieldPaper>
    </>
  );
}
