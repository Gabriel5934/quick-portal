import { useAuthQuery, ApiError } from "../auth/useAuthQuery";

type CnaeMcc = {
  id: number;
  cod_cnae: string;
  desc_cnae: string;
  cod_mcc: number;
};

async function fetchCnaeMcc(): Promise<CnaeMcc[]> {
  const token = localStorage.getItem("token");

  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/cnae-mcc/`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!res.ok) {
    throw new ApiError(res.status, "Failed to fetch CNAE-MCC data.");
  }

  return res.json() as Promise<CnaeMcc[]>;
}

export function useCnaeMcc() {
  return useAuthQuery<CnaeMcc[]>({
    queryKey: ["cnae-mcc"],
    queryFn: fetchCnaeMcc,
  });
}
