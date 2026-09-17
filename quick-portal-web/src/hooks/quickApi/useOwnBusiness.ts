import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { OwnBusinessFormValues } from "#features/business/own-business/types";
import { useToken } from "#hooks/auth/useToken";
import type { OwnBusinessDetails } from "./useOwnBusinesses";

type Payload = OwnBusinessFormValues & { businessId: number };
type ExistingPayload = {
  id: number;
  businessId: number;
};
type UpdatePayload = ExistingPayload & {
  values: OwnBusinessFormValues;
  changedFields: (keyof OwnBusinessFormValues)[];
};

const requestFieldByFormField: Partial<
  Record<keyof OwnBusinessFormValues, string>
> = {
  bankCode: "bank_code",
  branch: "bank_branch",
  branchDigit: "bank_branch_digit",
  account: "bank_account",
  accountDigit: "bank_account_digit",
  postalCode: "postal_code",
  number: "address_number",
  complement: "address_complement",
  planId: "plan",
  signatoryName: "signatory_name",
  signatoryCpf: "signatory_cpf",
  signatoryEmail: "signatory_email",
  expectedRevenue: "forecast_revenue",
  commitedRevenue: "contract_revenue",
  quantityPos: "pos_quantity",
};

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

function requestData(data: OwnBusinessFormValues) {
  return {
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
  };
}

function headers(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function createOwnBusiness(
  { businessId, ...data }: Payload,
  token: string,
): Promise<OwnBusinessDetails> {
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/own/businesses/`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ business: businessId, ...requestData(data) }),
    },
  );

  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as OwnBusinessDetails;
}

async function updateOwnBusiness(
  { id, values, changedFields }: UpdatePayload,
  token: string,
): Promise<OwnBusinessDetails> {
  const fullData = requestData(values);
  const changes: Record<string, string | number> = {};
  for (const field of changedFields) {
    const requestField = requestFieldByFormField[field];
    if (requestField) {
      changes[requestField] = fullData[requestField as keyof typeof fullData];
    }
  }
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/own/businesses/${id}/`,
    {
      method: "PATCH",
      headers: headers(token),
      body: JSON.stringify(changes),
    },
  );

  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as OwnBusinessDetails;
}

async function retryOwnBusiness(
  { id }: ExistingPayload,
  token: string,
): Promise<OwnBusinessDetails> {
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/own/businesses/${id}/retry/`,
    { method: "POST", headers: headers(token) },
  );

  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as OwnBusinessDetails;
}

export function useOwnBusiness() {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Payload) => createOwnBusiness(payload, token!),
    onSuccess: (ownBusiness, { businessId }) => {
      queryClient.setQueryData(["own-business", businessId], ownBusiness);
    },
    onError: async (_error, { businessId }) => {
      await queryClient.invalidateQueries({
        queryKey: ["own-business", businessId],
      });
    },
  });
}

export function useUpdateOwnBusiness() {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdatePayload) => updateOwnBusiness(payload, token!),
    onSuccess: (ownBusiness, { businessId }) => {
      queryClient.setQueryData(["own-business", businessId], ownBusiness);
    },
    onError: async (_error, { businessId }) => {
      await queryClient.invalidateQueries({
        queryKey: ["own-business", businessId],
      });
    },
  });
}

export function useRetryOwnBusiness() {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ExistingPayload) => retryOwnBusiness(payload, token!),
    onSuccess: (ownBusiness, { businessId }) => {
      queryClient.setQueryData(["own-business", businessId], ownBusiness);
    },
    onError: async (_error, { businessId }) => {
      await queryClient.invalidateQueries({
        queryKey: ["own-business", businessId],
      });
    },
  });
}
