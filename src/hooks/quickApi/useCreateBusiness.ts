import { useMutation } from "@tanstack/react-query";
import type { z } from "zod";
import type { step1Schema } from "#features/business/schemas";
import type { ValidationErrors } from "#hooks/types";
import { useToken } from "#hooks/auth/useToken";

type Step1Data = z.infer<typeof step1Schema>;
type CreateBusinessResponse = { id: number };

async function fetchCreateBusiness(
  payload: Step1Data,
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
        document_type: payload.documentType,
        document: payload.document.replace(/\D/g, ""),
        legal_name: payload.razaoSocial,
        trade_name: payload.nomeFantasia,
        cod_mcc: payload.mcc,
        email: payload.email,
        phone_number: payload.celular.replace(/\D/g, ""),
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
  return useMutation({ mutationFn: (payload: Step1Data) => fetchCreateBusiness(payload, token!) });
}
