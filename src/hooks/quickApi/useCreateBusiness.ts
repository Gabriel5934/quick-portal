import { useMutation } from "@tanstack/react-query";
import type { NewBusinessFormValues } from "#features/business/new-business/types";
import type { ValidationErrors } from "#hooks/types";
import { useToken } from "#hooks/auth/useToken";

type CreateBusinessPayload = NewBusinessFormValues & {
  parentId: number;
  type: "RE_RESELLER" | "STORE";
};
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
        type: payload.type,
        parent: payload.parentId,
        document_type: payload.documentType,
        document: payload.document.replace(/\D/g, ""),
        email: payload.email,
        phone: payload.celular.replace(/\D/g, ""),
        landline: payload.telefone.replace(/\D/g, ""),
        ...(payload.documentType === "CPF"
          ? {
              name: payload.name,
              cnae: payload.cnaeId,
            }
          : {}),
      }),
    },
  );

  const data = (await res.json().catch(() => null)) as
    | (Partial<CreateBusinessResponse> & ValidationErrors)
    | null;

  if (!res.ok) {
    const keys = Object.keys(data ?? {});
    const errors = data as ValidationErrors;
    throw new Error(
      keys.length && errors[keys[0]]?.[0]
        ? errors[keys[0]][0]
        : "Erro ao criar cadastro.",
    );
  }

  if (!data?.id) throw new Error("Resposta inválida do servidor.");

  return { id: data.id };
}

export function useCreateBusiness() {
  const { data: token } = useToken();
  return useMutation({
    mutationFn: (payload: CreateBusinessPayload) =>
      fetchCreateBusiness(payload, token!),
  });
}
