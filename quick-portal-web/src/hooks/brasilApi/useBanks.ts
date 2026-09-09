import { useQuery } from "@tanstack/react-query";

type Bank = {
  ispb: string;
  name: string;
  code: number;
  fullName: string;
};

async function fetchBanks(): Promise<Bank[]> {
  const res = await fetch("https://brasilapi.com.br/api/banks/v1");

  if (!res.ok) {
    throw new Error("Failed to fetch banks data.");
  }

  const data = (await res.json()) as Bank[];
  return data.filter((bank) => bank.code !== null);
}

export function useBanks() {
  return useQuery({
    queryKey: ["banks"],
    queryFn: fetchBanks,
  });
}
