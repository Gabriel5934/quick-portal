import { useAuthQuery, ApiError } from "./useAuthQuery";

type PosModel = {
  id: number;
  model: string;
};

async function fetchPosModels(): Promise<PosModel[]> {
  const token = localStorage.getItem("token");
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
  return useAuthQuery<PosModel[]>({
    queryKey: ["pos-models"],
    queryFn: fetchPosModels,
  });
}
