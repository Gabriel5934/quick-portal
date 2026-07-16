import { useQuery } from "@tanstack/react-query";

type CnpjData = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  cnae_fiscal: number;
};

type CnpjError = {
  type: string;
  message: string;
};

export class CnpjValidationError extends Error {}

async function fetchCnpj(cnpj: string): Promise<CnpjData> {
  const digits = cnpj.replace(/\D/g, "");
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);

  if (!res.ok) {
    const body = (await res.json()) as CnpjError;
    if (body.type === "validation_error") {
      throw new CnpjValidationError("CNPJ inválido");
    }
    throw new Error("Falha ao buscar CNPJ");
  }

  return res.json() as Promise<CnpjData>;
}

export function useCnpj(cnpj: string, enabled = true) {
  const digits = cnpj.replace(/\D/g, "");
  return useQuery({
    queryKey: ["cnpj", digits],
    queryFn: () => fetchCnpj(cnpj),
    enabled: enabled && digits.length === 14,
    retry: false,
  });
}
