import { useMutation } from "@tanstack/react-query";
import type { OwnBusinessFormValues } from "#features/business/own-business/types";
import { useToken } from "#hooks/auth/useToken";

type Payload = OwnBusinessFormValues & { businessId: number };

function parseBrl(value: string): number {
  const digits = value.replace(/[^\d,-]/g, "").replace(/\./g, "");
  const n = Number(digits.replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

async function throwResponseError(res: Response): Promise<never> {
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    if (body && typeof body === "object") {
      const responseBody = body as Record<string, unknown>;
      const detail = responseBody.detail;
      if (typeof detail === "string" && detail) {
        throw new Error(detail);
      }
      const values = Object.values(responseBody);
      const validationMessage = values.find(
        (value): value is string[] =>
          Array.isArray(value) && typeof value[0] === "string",
      )?.[0];
      if (validationMessage) {
        throw new Error(validationMessage);
      }
    }
    throw new Error("Erro ao credenciar o estabelecimento na OWN.");
  }

  throw new Error("Resposta inesperada do servidor.");
}

async function createOwnBusiness(
  { businessId, ...data }: Payload,
  token: string,
): Promise<void> {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/own/businesses/`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        business: businessId,
        cnae: data.activityId,
        plan: data.planId,
        signatory_name: data.signatoryName,
        signatory_cpf: data.signatoryCpf.replace(/\D/g, ""),
        signatory_email: data.signatoryEmail,
        forecast_revenue: parseBrl(data.expectedRevenue),
        contract_revenue: parseBrl(data.commitedRevenue),
        postal_code: data.postalCode.replace(/\D/g, ""),
        address_number: data.number,
        address_complement: data.complement ?? "",
        pos_quantity: data.quantityPos,
        bank_code: data.bankCode,
        bank_branch: data.branch,
        bank_branch_digit: data.branchDigit,
        bank_account: data.account,
        bank_account_digit: data.accountDigit,
      }),
    },
  );

  if (!response.ok) await throwResponseError(response);
}

export function useOwnBusiness() {
  const { data: token } = useToken();
  return useMutation({
    mutationFn: (payload: Payload) => createOwnBusiness(payload, token!),
  });
}
