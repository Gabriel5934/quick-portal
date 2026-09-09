import {
  keepPreviousData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError, useAuthQuery } from "../auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export type BusinessStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "IN_VALIDATION"
  | "COMPLETED";

export type BusinessType = "RESELLER" | "RE_RESELLER" | "STORE";
export type BusinessColor = "blue" | "green" | "yellow" | "purple" | "orange";

export interface Business {
  id: number;
  type: BusinessType;
  parent: number | null;
  document_type: string;
  document: string;
  name: string;
  trade_name: string;
  cnae: number | null;
  email: string;
  phone: string;
  landline: string;
  status: BusinessStatus;
  color: BusinessColor;
}

export interface BusinessesResponse {
  count: number;
  next: string | null;
  previous: string | null;
  count_by_status: Partial<Record<BusinessStatus, number>>;
  results: Business[];
}

interface BusinessQuery {
  parent?: number;
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
  if (query.parent) params.set("parent", String(query.parent));
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

async function fetchAllBusinesses(token: string): Promise<Business[]> {
  let url: string | null =
    `${import.meta.env.VITE_API_BASE_URL}/api/businesses/?page_size=100`;
  const businesses: Business[] = [];

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new ApiError(
        res.status,
        "Erro ao carregar a hierarquia de empresas.",
      );
    }

    const page = (await res.json()) as BusinessesResponse;
    businesses.push(...page.results);
    url = page.next;
  }

  return businesses;
}

export function useAllBusinesses() {
  const { data: token } = useToken();
  return useAuthQuery<Business[]>({
    queryKey: ["businesses", "all"],
    queryFn: () => fetchAllBusinesses(token!),
    enabled: !!token,
  });
}

async function fetchBusiness(id: number, token: string): Promise<Business> {
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/businesses/${id}/`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) throw new Error("Erro ao carregar o estabelecimento.");
  return res.json() as Promise<Business>;
}

export function useBusiness(id: number | undefined) {
  const { data: token } = useToken();
  return useAuthQuery<Business>({
    queryKey: ["business", id],
    queryFn: () => fetchBusiness(id!, token!),
    enabled: !!token && !!id,
  });
}

async function updateBusinessColor(
  id: number,
  color: BusinessColor,
  token: string,
): Promise<{ color: BusinessColor }> {
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/businesses/${id}/color/`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ color }),
    },
  );
  if (!res.ok) throw new Error("Erro ao salvar a cor da empresa.");
  return res.json() as Promise<{ color: BusinessColor }>;
}

export function useBusinessColor() {
  const { data: token } = useToken();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, color }: { id: number; color: BusinessColor }) =>
      updateBusinessColor(id, color, token!),
    onSuccess: ({ color }, { id }) => {
      queryClient.setQueryData<Business[]>(["businesses", "all"], (current) =>
        current?.map((business) =>
          business.id === id ? { ...business, color } : business,
        ),
      );
      queryClient.setQueryData<Business>(["business", id], (current) =>
        current ? { ...current, color } : current,
      );
    },
  });
}
