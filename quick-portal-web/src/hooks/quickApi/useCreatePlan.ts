import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToken } from "#hooks/auth/useToken";
import type { OwnPlanFee } from "./useOwnPlans";

export interface CreatePlanPayload {
  title: string;
  description: string;
  anticipation_type: "None" | "Rotating";
  activity: number;
  basketId: number;
  fees: OwnPlanFee[];
}

function firstError(body: unknown): string | null {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return null;
  for (const value of Object.values(body)) {
    const message = firstError(value);
    if (message) return message;
  }
  return null;
}

async function createPlan(
  payload: CreatePlanPayload,
  businessId: number,
  token: string,
): Promise<{ id: number }> {
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/own/plans/?business=${businessId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(firstError(body) ?? "Erro ao criar plano.");
  if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "number") {
    throw new Error("Resposta inválida do servidor.");
  }
  return { id: body.id };
}

export function useCreatePlan(businessId: number | undefined) {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePlanPayload) => createPlan(payload, businessId!, token!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["own-plans"] });
    },
  });
}
