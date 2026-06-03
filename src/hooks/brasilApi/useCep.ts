import { useQuery } from "@tanstack/react-query";

type CepData = {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  service: string;
};

type CepError = {
  type: string;
  message: string;
};

export class CepValidationError extends Error {}

async function fetchCep(cep: string): Promise<CepData> {
  const digits = cep.replace(/\D/g, "");
  const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${digits}`);

  if (!res.ok) {
    const body = (await res.json()) as CepError;
    if (body.type === "validation_error") {
      throw new CepValidationError("CEP inválido");
    }
    throw new Error("Falha ao buscar CEP");
  }

  return res.json() as Promise<CepData>;
}

export function useCep(cep: string) {
  const digits = cep.replace(/\D/g, "");
  return useQuery({
    queryKey: ["cep", digits],
    queryFn: () => fetchCep(cep),
    enabled: digits.length === 8,
    retry: false,
  });
}
