import { ApiError, useAuthQuery } from "#hooks/auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export interface OwnPlanFee {
  fee: number;
  value: string;
}

export interface OwnPlan {
  id: number;
  owner_business: number | null;
  created_by: number;
  created_at: string;
  updated_by: number;
  updated_at: string;
  title: string;
  description: string;
  anticipation_type: "None" | "Rotating";
  activity: number;
  basketId: number;
  fees: OwnPlanFee[];
}

async function fetchOwnPlans(
  token: string,
  businessId: number,
): Promise<OwnPlan[]> {
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/own/plans/?business=${businessId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new ApiError(response.status, "Erro ao carregar planos da OWN.");
  return response.json() as Promise<OwnPlan[]>;
}

export function useOwnPlans(businessId: number | undefined) {
  const { data: token } = useToken();
  return useAuthQuery<OwnPlan[]>({
    queryKey: ["own-plans", businessId],
    queryFn: () => fetchOwnPlans(token!, businessId!),
    enabled: !!token && !!businessId,
  });
}
