import { useMutation, useQueryClient } from "@tanstack/react-query";
import { firstError } from "#hooks/errors";
import { useToken } from "#hooks/auth/useToken";
import { useAuthQuery } from "#hooks/auth/useAuthQuery";
import type { Business } from "./useBusinesses";
import type {
  ChargeRule,
  PricingMode,
  RecurrenceUnit,
} from "#features/recurring-fees/form-store";

export interface RecurringFeePayload {
  name: string;
  description: string;
  setup_value: string;
  pricing_mode: PricingMode;
  fee_value: string | null;
  goal_amount: string | null;
  value_below_goal: string | null;
  value_at_or_above_goal: string | null;
  recurrence_unit: RecurrenceUnit;
  recurrence_interval: number;
  charge_rule: ChargeRule;
  charge_weekday: number | null;
  charge_day: number | null;
  charge_month: number | null;
  business_day_ordinal: number | null;
  start_date: string;
  end_date: string | null;
  active: boolean;
}

export interface RecurringFee extends RecurringFeePayload {
  id: number;
  owner: Pick<Business, "id" | "type" | "name" | "trade_name" | "document">;
  created_at: string;
  created_by: number;
}

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      firstError(data) ?? "Não foi possível concluir a operação.",
    );
  }
  return data as T;
}

export function useRecurringFees(ownerId?: number) {
  const { data: token } = useToken();
  return useAuthQuery<RecurringFee[]>({
    queryKey: ["recurring-fees", ownerId],
    queryFn: async () => {
      const page = await request<PaginatedResponse<RecurringFee>>(
        `${import.meta.env.VITE_API_BASE_URL}/api/businesses/${ownerId}/recurring-fees/?page_size=100`,
        token!,
      );
      return page.results;
    },
    enabled: !!token && !!ownerId,
  });
}

export function useCreateRecurringFee(ownerId?: number) {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RecurringFeePayload) =>
      request<RecurringFee>(
        `${import.meta.env.VITE_API_BASE_URL}/api/businesses/${ownerId}/recurring-fees/`,
        token!,
        { method: "POST", body: JSON.stringify(payload) },
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["recurring-fees", ownerId],
      }),
  });
}
