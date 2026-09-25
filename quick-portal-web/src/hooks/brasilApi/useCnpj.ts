import { useQuery } from "@tanstack/react-query";
import { isValidCnpj, normalizeCnpj } from "#features/business/document";

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
  const canonical = normalizeCnpj(cnpj);
  const res = await fetch(
    `https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(canonical)}`,
  );

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
  const canonical = normalizeCnpj(cnpj);
  return useQuery({
    queryKey: ["cnpj", canonical],
    queryFn: () => fetchCnpj(cnpj),
    enabled: enabled && isValidCnpj(canonical),
    retry: false,
  });
}
