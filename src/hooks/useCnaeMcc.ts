import { useQuery } from "@tanstack/react-query";

type CnaeMcc = {
  id: number;
  cod_cnae: string;
  desc_cnae: string;
  cod_mcc: number;
};

async function fetchCnaeMcc(): Promise<CnaeMcc[]> {
  const token = localStorage.getItem("token");

  const res = await fetch("http://localhost:8000/api/cnae-mcc/", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch CNAE-MCC data.");
  }

  return res.json() as Promise<CnaeMcc[]>;
}

export function useCnaeMcc() {
  return useQuery({
    queryKey: ["cnae-mcc"],
    queryFn: fetchCnaeMcc,
  });
}
