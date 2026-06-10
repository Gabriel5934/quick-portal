import { keepPreviousData } from "@tanstack/react-query";
import { useAuthQuery, ApiError } from "../auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export interface CardFeeGroup {
  debit: string | null;
  credit: string | null;
  installmentsA: string | null;
  installmentsB: string | null;
  installmentsC: string | null;
  installmentsD: string | null;
}

export interface PixFeeGroup {
  pix: string | null;
}

export interface MccFeeResponse {
  id: number;
  mcc: string;
  fee: {
    mastercard: CardFeeGroup;
    visa: CardFeeGroup;
    elo: CardFeeGroup;
    pix: PixFeeGroup;
  };
}

async function fetchMccFee(id: number, token: string): Promise<MccFeeResponse> {
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/mccs/${id}/fees/`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    throw new ApiError(res.status, "Erro ao carregar taxas base do MCC.");
  }

  return res.json() as Promise<MccFeeResponse>;
}

export function useMccFee(id: number | null | undefined) {
  const { data: token } = useToken();
  return useAuthQuery<MccFeeResponse>({
    queryKey: ["mcc-fee", id],
    queryFn: () => fetchMccFee(id!, token!),
    enabled: !!token && !!id,
    placeholderData: keepPreviousData,
  });
}
