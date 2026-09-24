import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CieloBusinessFormValues,
  CieloBusinessSummary,
  CieloCreateRequest,
  CieloOption,
} from "#features/cielo/types";
import { normalizeDocument } from "#features/cielo/validators";
import { useAuthQuery } from "#hooks/auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function firstErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstErrorMessage(item);
      if (message) return message;
    }
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const message = firstErrorMessage(item);
      if (message) return message;
    }
  }
  return undefined;
}

async function responseError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  return new Error(firstErrorMessage(body) ?? fallback);
}

export function cieloRequestData(
  values: CieloBusinessFormValues,
): CieloCreateRequest {
  const bankDocumentType = values.bankDocumentType;
  return {
    ...(values.contactName.trim()
      ? { contact_name: values.contactName.trim() }
      : {}),
    website: values.website,
    birthday_date: values.birthdayDate || null,
    business_activity_id: values.businessActivityId || null,
    bank_account: {
      bank: values.bank,
      bank_account_type: values.bankAccountType,
      number: values.bankAccountNumber,
      verifier_digit: values.bankAccountVerifierDigit,
      agency_number: values.bankAgencyNumber,
      ...(values.bankAgencyDigit
        ? { agency_digit: values.bankAgencyDigit }
        : {}),
      document_type: bankDocumentType,
      document_number: normalizeDocument(
        values.bankDocumentNumber,
        bankDocumentType,
      ),
    },
    address: {
      number: values.addressNumber,
      complement: values.addressComplement,
      zip_code: values.addressZipCode.replace(/\D/g, ""),
    },
  };
}

async function fetchCieloBusiness(
  businessId: number,
  token: string,
): Promise<CieloBusinessSummary | null> {
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/cielo/businesses/${businessId}/`,
    { headers: authHeaders(token) },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw await responseError(
      response,
      "Erro ao carregar o credenciamento Cielo.",
    );
  }
  return (await response.json()) as CieloBusinessSummary;
}

export function useCieloBusiness(businessId: number | undefined) {
  const { data: token } = useToken();
  return useAuthQuery<CieloBusinessSummary | null>({
    queryKey: ["cielo-business", businessId],
    queryFn: () => fetchCieloBusiness(businessId!, token!),
    enabled: !!businessId && !!token,
  });
}

type OptionPath =
  | "document-types"
  | "bank-account-types"
  | "business-activities"
  | "banks";

export function useCieloOptions(path: OptionPath, enabled = true) {
  const { data: token } = useToken();
  return useAuthQuery<CieloOption[]>({
    queryKey: ["cielo-options", path],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/cielo/options/${path}/`,
        { headers: authHeaders(token!) },
      );
      if (!response.ok) {
        throw await responseError(
          response,
          "Erro ao carregar opções da Cielo.",
        );
      }
      return (await response.json()) as CieloOption[];
    },
    enabled: enabled && !!token,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useCreateCieloBusiness() {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      businessId,
      values,
    }: {
      businessId: number;
      values: CieloBusinessFormValues;
    }) => {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/cielo/businesses/${businessId}/`,
        {
          method: "POST",
          headers: authHeaders(token!),
          body: JSON.stringify(cieloRequestData(values)),
        },
      );
      if (!response.ok) {
        throw await responseError(
          response,
          "Erro ao credenciar o estabelecimento na Cielo.",
        );
      }
      return (await response.json()) as CieloBusinessSummary;
    },
    onSuccess: (seller, { businessId }) => {
      queryClient.setQueryData(["cielo-business", businessId], seller);
    },
  });
}

export function useRetryCieloBusiness() {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ businessId }: { businessId: number }) => {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/cielo/businesses/${businessId}/retry/`,
        { method: "POST", headers: authHeaders(token!) },
      );
      if (!response.ok) {
        throw await responseError(
          response,
          "Erro ao reenviar o credenciamento à Cielo.",
        );
      }
      return (await response.json()) as CieloBusinessSummary;
    },
    onSuccess: (seller, { businessId }) => {
      queryClient.setQueryData(["cielo-business", businessId], seller);
    },
  });
}
