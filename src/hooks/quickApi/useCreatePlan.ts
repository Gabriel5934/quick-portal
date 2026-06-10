import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToken } from "#hooks/auth/useToken";
import type { ValidationErrors } from "#hooks/types";

export interface CreatePlanPayload {
  name: string;
  description: string;
  split: boolean;
  anticipation: boolean;
  mcc_id: number;
  fees: {
    network: string;
    payment_type: string;
    commission: string;
    anticipation_fee: string | null;
  }[];
}

type CreatePlanResponse = { id: number };

async function fetchCreatePlan(
  payload: CreatePlanPayload,
  token: string,
): Promise<CreatePlanResponse> {
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/plans/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => null)) as
    | (Partial<CreatePlanResponse> & ValidationErrors)
    | null;

  if (!res.ok) {
    const keys = Object.keys(data ?? {});
    const errors = data as ValidationErrors;
    const first = keys.length ? errors[keys[0]] : null;
    const message = Array.isArray(first) ? first[0] : first;
    throw new Error(message || "Erro ao criar plano.");
  }

  if (!data?.id) throw new Error("Resposta inválida do servidor.");

  return { id: data.id };
}

export function useCreatePlan() {
  const { data: token } = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePlanPayload) =>
      fetchCreatePlan(payload, token!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plans"] });
    },
  });
}
