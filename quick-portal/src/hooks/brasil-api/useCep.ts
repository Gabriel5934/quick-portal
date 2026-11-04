import { useQuery } from '@tanstack/react-query';

export type CepAddress = {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
};

export class CepError extends Error {}

async function fetchCep(zipCode: string): Promise<CepAddress> {
  let response: Response;
  try {
    response = await fetch(`https://brasilapi.com.br/api/cep/v1/${zipCode}`);
  } catch {
    throw new CepError('Não foi possível consultar o CEP. Tente novamente.');
  }
  if (response.status === 404 || response.status === 400) {
    throw new CepError('CEP não encontrado.');
  }
  if (!response.ok) {
    throw new CepError('Não foi possível consultar o CEP. Tente novamente.');
  }
  return (await response.json()) as CepAddress;
}

/** BrasilAPI CEP lookup; runs once the zip code has its 8 digits. */
export function useCep(zipCode: string) {
  const digits = zipCode.replace(/\D/g, '');
  return useQuery({
    queryKey: ['brasil-api', 'cep', digits] as const,
    queryFn: () => fetchCep(digits),
    enabled: digits.length === 8,
    retry: false,
    staleTime: Infinity,
  });
}
