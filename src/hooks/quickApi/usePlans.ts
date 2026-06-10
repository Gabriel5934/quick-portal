import { useAuthQuery, ApiError } from "../auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export type PlanNetwork = "mastercard" | "visa" | "elo" | "pix";

export interface PlanFee {
  network: PlanNetwork;
  payment_type: string;
  commission: string;
  anticipation_fee: string | null;
}

export interface Plan {
  id: number;
  name: string;
  description: string;
  split: boolean;
  anticipation: boolean;
  mcc: { id: number; mcc: string };
  fees: PlanFee[];
  created_at: string;
}

async function fetchPlans(token: string): Promise<Plan[]> {
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/plans/`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new ApiError(res.status, "Erro ao carregar planos.");
  }

  return res.json() as Promise<Plan[]>;
}

export function usePlans() {
  const { data: token } = useToken();
  return useAuthQuery<Plan[]>({
    queryKey: ["plans"],
    queryFn: () => fetchPlans(token!),
    enabled: !!token,
  });
}
