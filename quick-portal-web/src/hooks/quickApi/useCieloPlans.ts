import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CieloPlan,
  CieloPlanCreateRequest,
  CieloPlanSummary,
} from "#features/cielo-plans/types";
import { ApiError, useAuthQuery } from "#hooks/auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

/** A failed plan request; `body` keeps the DRF field errors. */
export class CieloPlanRequestError extends ApiError {
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(status, message);
    this.name = "CieloPlanRequestError";
    this.body = body;
  }
}

function firstErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const message = firstErrorMessage(item);
      if (message) return message;
    }
  }
  return undefined;
}

async function planRequest<T>(
  path: string,
  token: string,
  fallbackMessage: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/cielo/plans/${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new CieloPlanRequestError(
      response.status,
      firstErrorMessage(body) ?? fallbackMessage,
      body,
    );
  }
  return body as T;
}

function listKey(businessId: number | undefined, archived: boolean) {
  return ["cielo-plans", businessId, archived ? "archived" : "active"];
}

function detailKey(businessId: number | undefined, planId: number | undefined) {
  return ["cielo-plans", businessId, "detail", planId];
}

/** Plans owned by `businessId`: active ones, or archived ones with `archived`. */
export function useCieloPlans(
  businessId: number | undefined,
  { archived = false }: { archived?: boolean } = {},
) {
  const { data: token } = useToken();
  return useAuthQuery<CieloPlanSummary[]>({
    queryKey: listKey(businessId, archived),
    queryFn: () =>
      planRequest(
        `?business=${businessId}${archived ? "&archived=true" : ""}`,
        token!,
        "Erro ao carregar os planos Cielo.",
      ),
    enabled: !!token && !!businessId,
  });
}

/** Plan `planId` owned by `businessId`, or `null` when it is not found. */
export function useCieloPlan(
  planId: number | undefined,
  businessId: number | undefined,
) {
  const { data: token } = useToken();
  return useAuthQuery<CieloPlan | null>({
    queryKey: detailKey(businessId, planId),
    queryFn: async () => {
      try {
        return await planRequest<CieloPlan>(
          `${planId}/?business=${businessId}`,
          token!,
          "Erro ao carregar o plano Cielo.",
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: !!token && !!businessId && !!planId,
  });
}

export function useCreateCieloPlan(businessId: number | undefined) {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CieloPlanCreateRequest) =>
      planRequest<CieloPlan>(
        `?business=${businessId}`,
        token!,
        "Erro ao criar o plano Cielo.",
        { method: "POST", body: JSON.stringify(payload) },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: listKey(businessId, false),
      }),
  });
}

export function useSetCieloPlanArchived(businessId: number | undefined) {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, archived }: { planId: number; archived: boolean }) =>
      planRequest<CieloPlan>(
        `${planId}/${archived ? "archive" : "unarchive"}/?business=${businessId}`,
        token!,
        archived
          ? "Erro ao arquivar o plano Cielo."
          : "Erro ao desarquivar o plano Cielo.",
        { method: "POST" },
      ),
    onSuccess: (plan) => {
      queryClient.setQueryData(detailKey(businessId, plan.id), plan);
    },
    onError: (_error, { planId }) =>
      queryClient.invalidateQueries({ queryKey: detailKey(businessId, planId) }),
    onSettled: () =>
      Promise.all(
        [false, true].map((archived) =>
          queryClient.invalidateQueries({
            queryKey: listKey(businessId, archived),
          }),
        ),
      ),
  });
}
