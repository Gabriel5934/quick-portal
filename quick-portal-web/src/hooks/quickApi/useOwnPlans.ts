import { ApiError, useAuthQuery } from "#hooks/auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export interface OwnPlan {
  id: number;
  title: string;
  activity: number;
}

async function fetchOwnPlans(token: string): Promise<OwnPlan[]> {
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/own/plans/`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) {
    throw new ApiError(response.status, "Erro ao carregar planos da OWN.");
  }

  return response.json() as Promise<OwnPlan[]>;
}

export function useOwnPlans() {
  const { data: token } = useToken();
  return useAuthQuery<OwnPlan[]>({
    queryKey: ["own-plans"],
    queryFn: () => fetchOwnPlans(token!),
    enabled: !!token,
  });
}
