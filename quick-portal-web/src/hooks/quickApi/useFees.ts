import { ApiError, useAuthQuery } from "../auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export interface FeeOption {
  id: number;
  value: string;
}

interface FeeResponse extends FeeOption {
  acquirer: number;
  cnae: string;
  network: number;
  network_code: string;
  installments: number;
}

export type FeeCatalog = Record<string, Partial<Record<number, FeeOption>>>;

function buildFeeCatalog(fees: FeeResponse[]): FeeCatalog {
  const catalog: FeeCatalog = {};
  for (const fee of fees) {
    const networkCode = fee.network_code.trim().toLowerCase();
    const network =
      fee.installments === -2
        ? "acquirer"
        : networkCode;
    catalog[network] ??= {};
    catalog[network][fee.installments] = { id: fee.id, value: fee.value };
  }

  return catalog;
}

async function fetchFees(
  acquirerId: number,
  cnae: string,
  token: string,
): Promise<FeeCatalog> {
  const query = new URLSearchParams({
    acquirer: String(acquirerId),
    cnae,
  });
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/fees/?${query.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    throw new ApiError(res.status, "Erro ao carregar taxas.");
  }

  return buildFeeCatalog((await res.json()) as FeeResponse[]);
}

export function useFees(
  acquirerId: number | null | undefined,
  cnae: string | undefined,
) {
  const { data: token } = useToken();
  return useAuthQuery<FeeCatalog>({
    queryKey: ["fees", acquirerId, cnae],
    queryFn: () => fetchFees(acquirerId!, cnae!, token!),
    enabled: !!token && !!acquirerId && !!cnae,
  });
}
