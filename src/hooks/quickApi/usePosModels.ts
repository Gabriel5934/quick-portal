import { useAuthQuery, ApiError } from "#hooks/auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

type PosModel = {
  id: number;
  model: string;
};

async function fetchPosModels(token: string): Promise<PosModel[]> {
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/pos-models/`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!res.ok) throw new ApiError(res.status, "Failed to fetch POS models.");
  return res.json() as Promise<PosModel[]>;
}

export function usePosModels() {
  const { data: token } = useToken();
  return useAuthQuery<PosModel[]>({
    queryKey: ["pos-models"],
    queryFn: () => fetchPosModels(token!),
    enabled: !!token,
  });
}
