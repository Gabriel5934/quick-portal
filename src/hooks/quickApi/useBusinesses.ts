import { keepPreviousData } from "@tanstack/react-query";
import { useAuthQuery } from "../auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export type BusinessStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "IN_VALIDATION"
  | "COMPLETED";

export interface Business {
  id: number;
  document_type: string;
  document: string;
  name: string;
  trade_name: string;
  cod_cnae: string;
  email: string;
  phone: string;
  landline: string;
  status: BusinessStatus;
}

export interface BusinessesResponse {
  count: number;
  next: string | null;
  previous: string | null;
  count_by_status: Partial<Record<BusinessStatus, number>>;
  results: Business[];
}

interface BusinessQuery {
  document?: string;
  name?: string;
  trade_name?: string;
  page?: number;
  page_size?: number;
}

async function fetchBusinesses(
  query: BusinessQuery,
  token: string,
): Promise<BusinessesResponse> {
  const params = new URLSearchParams();
  if (query.document) {
    const document = query.document.replace(/\D/g, "");
    if (document) params.set("document", document);
  }
  if (query.name) params.set("name", query.name);
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
  const { data: token } = useToken();
  return useAuthQuery<BusinessesResponse>({
    queryKey: ["businesses", query],
    queryFn: () => fetchBusinesses(query, token!),
    placeholderData: keepPreviousData,
    enabled: !!token,
  });
}
