import { ApiError, useAuthQuery } from "#hooks/auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

export type OwnRegistrationStatus =
  | "PENDING"
  | "REGISTERED"
  | "API_REQUEST_FAILED"
  | "UNKNOWN";

export interface OwnBusinessDetails {
  id: number;
  business: number;
  cnae: number;
  plan: number;
  signatory_name: string;
  signatory_cpf: string;
  signatory_email: string;
  forecast_revenue: string;
  contract_revenue: string;
  postal_code: string;
  street: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state: string;
  pos_quantity: number;
  bank_code: string;
  bank_branch: string;
  bank_branch_digit: string;
  bank_account: string;
  bank_account_digit: string;
  core_protocol: string;
  contract_number: string;
  registration_status: OwnRegistrationStatus;
  registration_error: string;
  created_at: string;
  updated_at: string;
}

async function fetchOwnBusiness(
  businessId: number,
  token: string,
): Promise<OwnBusinessDetails | null> {
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/own/businesses/`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) {
    throw new ApiError(
      response.status,
      "Erro ao carregar o credenciamento OWN.",
    );
  }

  const ownBusinesses = (await response.json()) as OwnBusinessDetails[];
  return (
    ownBusinesses.find((ownBusiness) => ownBusiness.business === businessId) ??
    null
  );
}

export function useOwnBusinessForBusiness(
  businessId: number | undefined,
  enabled = true,
) {
  const { data: token } = useToken();
  return useAuthQuery<OwnBusinessDetails | null>({
    queryKey: ["own-business", businessId],
    queryFn: () => fetchOwnBusiness(businessId!, token!),
    enabled: enabled && !!businessId && !!token,
  });
}
