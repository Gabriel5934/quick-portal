import { ApiError, useAuthQuery } from "#hooks/auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export interface OwnFee {
  id: number;
  basketId: number;
  value: string;
  baseMdr: string;
  network: "Visa" | "Elo" | "Mastercard" | null;
  channel: "Physical" | "Ecommerce" | null;
  method: string;
  installment: number | null;
  upperInstallment: number | null;
}

async function fetchOwnFees(token: string): Promise<OwnFee[]> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/own/fees/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new ApiError(response.status, "Erro ao carregar taxas OWN.");
  return response.json() as Promise<OwnFee[]>;
}

export function useOwnFees() {
  const { data: token } = useToken();
  return useAuthQuery<OwnFee[]>({
    queryKey: ["own-fees"],
    queryFn: () => fetchOwnFees(token!),
    enabled: !!token,
  });
}
