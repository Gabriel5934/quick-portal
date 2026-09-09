import { ApiError, useAuthQuery } from "../auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export interface NetworkOption {
  id: number;
  name: string;
  color: string;
}

export function networkCode(network: NetworkOption): string {
  return network.name.trim().toLowerCase();
}

async function fetchNetworks(token: string): Promise<NetworkOption[]> {
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/networks/`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    throw new ApiError(res.status, "Erro ao carregar redes de pagamento.");
  }

  return res.json() as Promise<NetworkOption[]>;
}

export function useNetworks() {
  const { data: token } = useToken();
  return useAuthQuery<NetworkOption[]>({
    queryKey: ["networks"],
    queryFn: () => fetchNetworks(token!),
    enabled: !!token,
  });
}
