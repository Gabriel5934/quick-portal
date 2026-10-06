import { keepPreviousData } from "@tanstack/react-query";
import type { CieloTransactionsResponse } from "#features/sales/types";
import { ApiError, useAuthQuery } from "#hooks/auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

interface CieloTransactionsQuery {
  /** 1-based, like the API. */
  page: number;
  pageSize: number;
}

async function fetchCieloTransactions(
  businessId: number,
  { page, pageSize }: CieloTransactionsQuery,
  token: string,
): Promise<CieloTransactionsResponse> {
  const params = new URLSearchParams({
    business: String(businessId),
    page: String(page),
    page_size: String(pageSize),
  });
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/cielo/transactions/?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new ApiError(response.status, "Erro ao carregar as vendas.");
  }
  return response.json() as Promise<CieloTransactionsResponse>;
}

/** Cielo transactions of `businessId`'s own seller, newest first. */
export function useCieloTransactions(
  businessId: number | undefined,
  query: CieloTransactionsQuery,
) {
  const { data: token } = useToken();
  return useAuthQuery<CieloTransactionsResponse>({
    queryKey: ["cielo-transactions", businessId, query.page, query.pageSize],
    queryFn: () => fetchCieloTransactions(businessId!, query, token!),
    placeholderData: keepPreviousData,
    enabled: !!token && !!businessId,
  });
}
