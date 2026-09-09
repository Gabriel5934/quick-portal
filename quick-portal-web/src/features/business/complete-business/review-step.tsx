import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useBanks } from "#hooks/brasilApi/useBanks";
import { useAcquirers } from "#hooks/quickApi/useAcquirers";
import { usePlans } from "#hooks/quickApi/usePlans";
import { usePosModels } from "#hooks/quickApi/usePosModels";
import { FormFieldPaper } from "../../../components/multi-step-form";
import type { CompleteBusinessFormValues } from "./types";

interface CompleteBusinessReviewStepProps {
  values: CompleteBusinessFormValues;
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

export function CompleteBusinessReviewStep({
  values,
}: CompleteBusinessReviewStepProps) {
  const { data: banks = [] } = useBanks();
  const { data: acquirers = [] } = useAcquirers();
  const { data: plans = [] } = usePlans();
  const { data: posModels = [] } = usePosModels();
  const bank = banks.find((item) => String(item.code) === values.bankCode);
  const acquirer = acquirers.find((item) => item.id === values.acquirerId);
  const plan = plans.find((item) => item.id === values.planId);
  const devices = values.posDevices.filter(
    (device) => device.model && device.serialNumber,
  );

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
      <FormFieldPaper title={`Terminais (${devices.length})`}>
        <Stack divider={<Divider flexItem />} spacing={1}>
          {devices.length === 0 ? (
            <Typography color="text.secondary">
              Nenhum terminal informado.
            </Typography>
          ) : (
            devices.map((device, index) => (
              <ReviewItem
                key={`${device.model}-${device.serialNumber}-${index}`}
                label={
                  posModels.find((model) => String(model.id) === device.model)
                    ?.model ?? `Terminal ${index + 1}`
                }
                value={device.serialNumber}
              />
            ))
          )}
        </Stack>
      </FormFieldPaper>
      <FormFieldPaper title="Plano comercial">
        <Stack divider={<Divider flexItem />} spacing={1}>
          <ReviewItem label="Adquirente" value={acquirer?.name} />
          <ReviewItem label="Plano" value={plan?.name} />
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
