import { useAuthQuery, ApiError } from "../auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export interface MccOption {
  id: number;
  mcc: string;
}

async function fetchMccs(token: string): Promise<MccOption[]> {
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/mccs/`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new ApiError(res.status, "Erro ao carregar MCCs.");
  }

  return res.json() as Promise<MccOption[]>;
}

export function useMccs() {
  const { data: token } = useToken();
  return useAuthQuery<MccOption[]>({
    queryKey: ["mccs"],
    queryFn: () => fetchMccs(token!),
    enabled: !!token,
  });
}
