import { ApiError, useAuthQuery } from "../auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export interface AcquirerOption {
  id: number;
  name: string;
}

async function fetchAcquirers(token: string): Promise<AcquirerOption[]> {
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/acquirers/`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    throw new ApiError(res.status, "Erro ao carregar adquirentes.");
  }

  return res.json() as Promise<AcquirerOption[]>;
}

export function useAcquirers() {
  const { data: token } = useToken();
  return useAuthQuery<AcquirerOption[]>({
    queryKey: ["acquirers"],
    queryFn: () => fetchAcquirers(token!),
    enabled: !!token,
  });
}
