import { ApiError, useAuthQuery } from "../auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export type FeeNetwork = "mastercard" | "visa" | "elo" | "pix" | "acquirer";

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

export type FeeCatalog = Record<FeeNetwork, Partial<Record<number, FeeOption>>>;

const CARD_NETWORKS = new Set<FeeNetwork>(["elo", "mastercard", "visa"]);

function buildFeeCatalog(fees: FeeResponse[]): FeeCatalog {
  const catalog: FeeCatalog = {
    mastercard: {},
    visa: {},
    elo: {},
    pix: {},
    acquirer: {},
  };
  for (const fee of fees) {
    const networkCode = fee.network_code.toLowerCase() as FeeNetwork;
    const network =
      fee.installments === -2
        ? "acquirer"
        : fee.installments === -1
          ? "pix"
          : CARD_NETWORKS.has(networkCode)
            ? networkCode
            : undefined;
    if (!network) continue;
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
