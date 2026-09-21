import { ApiError, useAuthQuery } from "#hooks/auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export interface OwnActivity {
  cnae: number;
  description: string;
  mcc: number;
}

async function fetchOwnActivities(token: string): Promise<OwnActivity[]> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/own/activities/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new ApiError(response.status, "Erro ao carregar atividades OWN.");
  return response.json() as Promise<OwnActivity[]>;
}

export function useOwnActivities() {
  const { data: token } = useToken();
  return useAuthQuery<OwnActivity[]>({
    queryKey: ["own-activities"],
    queryFn: () => fetchOwnActivities(token!),
    enabled: !!token,
  });
}
