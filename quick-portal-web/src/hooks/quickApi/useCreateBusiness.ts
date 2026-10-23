import { useMutation, useQueryClient } from "@tanstack/react-query";
import { normalizeDocument } from "#features/business/document";
import type { NewBusinessFormValues } from "#features/business/new-business/types";
import { firstError } from "#hooks/errors";
import { useToken } from "#hooks/auth/useToken";

type CreateBusinessPayload = NewBusinessFormValues;
type CreateBusinessResponse = { id: number };

async function fetchCreateBusiness(
  payload: CreateBusinessPayload,
  token: string,
): Promise<CreateBusinessResponse> {
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/businesses/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        // New businesses are always stores without a parent.
        type: "STORE",
        document_type: payload.documentType,
        document: normalizeDocument(payload.document, payload.documentType),
        email: payload.email,
        phone: payload.celular.replace(/\D/g, ""),
        landline: payload.telefone.replace(/\D/g, ""),
        ...(payload.documentType === "CPF" ? { name: payload.name } : {}),
      }),
    },
  );

  const data = (await res.json().catch(() => null)) as
    | Partial<CreateBusinessResponse>
    | null;

  if (!res.ok) {
    throw new Error(firstError(data) ?? "Erro ao criar cadastro.");
  }

  if (!data?.id) throw new Error("Resposta inválida do servidor.");

  return { id: data.id };
}

export function useCreateBusiness() {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBusinessPayload) =>
      fetchCreateBusiness(payload, token!),
    // The creator becomes an admin of the new business, so reload the
    // business picker before callers select it.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["businesses", "all"] }),
  });
}
