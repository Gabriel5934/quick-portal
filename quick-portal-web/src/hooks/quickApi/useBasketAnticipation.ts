import { ApiError, useAuthQuery } from "#hooks/auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

interface BasketAnticipation {
  basketId: number;
  anticipation_fee: string;
}

async function fetchBasketAnticipation(token: string, basketId: number): Promise<BasketAnticipation> {
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/own/baskets/${basketId}/anticipation-fee/`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new ApiError(response.status, "Erro ao carregar antecipação da cesta.");
  return response.json() as Promise<BasketAnticipation>;
}

export function useBasketAnticipation(basketId: number | undefined) {
  const { data: token } = useToken();
  return useAuthQuery<BasketAnticipation>({
    queryKey: ["basket-anticipation", basketId],
    queryFn: () => fetchBasketAnticipation(token!, basketId!),
    enabled: !!token && !!basketId,
  });
}
