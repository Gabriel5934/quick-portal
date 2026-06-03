import { keepPreviousData } from "@tanstack/react-query";
import { useAuthQuery } from "./useAuthQuery";

export interface Business {
  id: number;
  document_type: string;
  document: string;
  legal_name: string;
  trade_name: string;
  mcc: {
    id: number;
    cod_cnae: string;
    desc_cnae: string;
    cod_mcc: number;
  };
  email: string;
  phone_number: string;
  own_status: string;
}

export interface BusinessesResponse {
  count: number;
  next: string | null;
  previous: string | null;
  count_by_status: Record<string, number>;
  results: Business[];
}

interface BusinessQuery {
  document?: string;
  legal_name?: string;
  trade_name?: string;
  page?: number;
  page_size?: number;
}

async function fetchBusinesses(
  query: BusinessQuery,
): Promise<BusinessesResponse> {
  const token = localStorage.getItem("token");
  const params = new URLSearchParams();
  if (query.document) params.set("document", query.document);
  if (query.legal_name) params.set("legal_name", query.legal_name);
  if (query.trade_name) params.set("trade_name", query.trade_name);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.page_size) params.set("page_size", String(query.page_size));

  const qs = params.toString();
  const url = `${import.meta.env.VITE_API_BASE_URL}/api/businesses/${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error("Erro ao carregar estabelecimentos.");

  return res.json() as Promise<BusinessesResponse>;
}

export function useBusinesses(query: BusinessQuery = {}) {
  return useAuthQuery<BusinessesResponse>({
    queryKey: ["businesses", query],
    queryFn: () => fetchBusinesses(query),
    placeholderData: keepPreviousData,
  });
}
