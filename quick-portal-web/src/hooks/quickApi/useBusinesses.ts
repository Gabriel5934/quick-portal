import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, useAuthQuery } from "../auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export type BusinessType = "RESELLER" | "RE_RESELLER" | "STORE";
export type BusinessDocumentType = "CNPJ" | "CPF";
export type BusinessColor = "blue" | "green" | "yellow" | "purple" | "orange";
export type BusinessRole = "ADMIN" | "MANAGER" | "VIEWER";

export interface Business {
  id: number;
  type: BusinessType;
  parent: number | null;
  document_type: BusinessDocumentType;
  document: string;
  name: string;
  trade_name: string;
  email: string;
  phone: string;
  landline: string;
  color: BusinessColor;
  /** The requesting user's role on this business. */
  role: BusinessRole | null;
}

export interface BusinessesResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Business[];
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
        "Erro ao carregar as empresas.",
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
