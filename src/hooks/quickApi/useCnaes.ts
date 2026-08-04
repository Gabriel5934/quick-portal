import { ApiError, useAuthQuery } from "../auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export interface CnaeOption {
  id: number;
  code: string;
  description: string;
  mcc: string;
}

async function fetchCnaes(
  acquirerId: number,
  token: string,
): Promise<CnaeOption[]> {
  const params = new URLSearchParams({ acquirer: String(acquirerId) });
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/cnaes-with-fees/?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    throw new ApiError(res.status, "Erro ao carregar CNAEs.");
  }

  return res.json() as Promise<CnaeOption[]>;
}

export function useCnaes(acquirerId: number | undefined) {
  const { data: token } = useToken();
  return useAuthQuery<CnaeOption[]>({
    queryKey: ["cnaes-with-fees", acquirerId],
    queryFn: () => fetchCnaes(acquirerId!, token!),
    enabled: !!token && !!acquirerId,
  });
}

async function fetchAllCnaes(token: string): Promise<CnaeOption[]> {
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/cnaes/`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new ApiError(res.status, "Erro ao carregar CNAEs.");
  }
  return res.json() as Promise<CnaeOption[]>;
}

export function useAllCnaes() {
  const { data: token } = useToken();
  return useAuthQuery<CnaeOption[]>({
    queryKey: ["cnaes"],
    queryFn: () => fetchAllCnaes(token!),
    enabled: !!token,
  });
}
