import { useQuery } from "@tanstack/react-query";

interface CieloCnpjData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
}

async function fetchCieloCnpj(cnpj: string): Promise<CieloCnpjData> {
  const response = await fetch(
    `https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(cnpj)}`,
  );
  if (!response.ok) throw new Error("Falha ao consultar o CNPJ na BrasilAPI");
  const data = (await response.json()) as Partial<CieloCnpjData>;
  if (!data.razao_social || typeof data.nome_fantasia !== "string") {
    throw new Error("A BrasilAPI retornou dados incompletos para o CNPJ");
  }
  return data as CieloCnpjData;
}

export function useCieloCnpj(cnpj: string, enabled: boolean) {
  return useQuery({
    queryKey: ["cielo-cnpj", cnpj],
    queryFn: () => fetchCieloCnpj(cnpj),
    enabled,
    retry: false,
  });
}
