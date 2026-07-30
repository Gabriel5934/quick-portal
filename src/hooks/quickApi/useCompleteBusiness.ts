import { useMutation } from "@tanstack/react-query";
import type { CompleteBusinessFormValues } from "#features/business/types";
import type { ValidationErrors } from "#hooks/types";
import { useToken } from "#hooks/auth/useToken";

type Payload = CompleteBusinessFormValues & { id: number };

function parseBrl(value: string): number {
  const digits = value.replace(/[^\d,-]/g, "").replace(/\./g, "");
  const n = Number(digits.replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

async function throwResponseError(res: Response): Promise<never> {
  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => null)) as ValidationErrors | null;
    const keys = Object.keys(body ?? {});
    throw new Error(
      keys.length && (body as ValidationErrors)[keys[0]]?.[0]
        ? (body as ValidationErrors)[keys[0]][0]
        : "Erro ao completar cadastro.",
    );
  }

  throw new Error("Resposta inesperada do servidor.");
}

async function fetchCompleteBusiness({ id, ...data }: Payload, token: string): Promise<void> {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const detailsResponse = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/business-details/`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        business: id,
        bank_code: data.bankCode,
        branch: data.branch,
        branch_digit: data.branchDigit,
        account_number: data.account,
        account_digit: data.accountDigit,
        cep: data.postalCode.replace(/\D/g, ""),
        address_number: data.number,
        address_line2: data.complement ?? "",
        projected_revenue: parseBrl(data.expectedRevenue),
        commited_revenue: parseBrl(data.commitedRevenue),
        amount_of_terminals: data.quantityPos,
        plan: data.planId,
      }),
    },
  );

  if (!detailsResponse.ok) await throwResponseError(detailsResponse);

  const completedDevices = data.posDevices.filter(
    (device) => device.model && device.serialNumber,
  );
  const deviceResponses = await Promise.all(
    completedDevices.map((device) =>
      fetch(`${import.meta.env.VITE_API_BASE_URL}/api/pos-devices/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          business: id,
          model: Number(device.model),
          serial: device.serialNumber,
        }),
      }),
    ),
  );

  const failedDeviceResponse = deviceResponses.find((res) => !res.ok);
  if (failedDeviceResponse) await throwResponseError(failedDeviceResponse);
}

export function useCompleteBusiness() {
  const { data: token } = useToken();
  return useMutation({ mutationFn: (payload: Payload) => fetchCompleteBusiness(payload, token!) });
}
