import type { CieloSeller, Me, Session } from '../src/api/types';

export const mockSession = (): Session => ({
  accessToken: 'storybook-access-token',
  expiresAt: Date.now() + 60 * 60 * 1000,
});

export const mockMe: Me = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'gabriel@quickdigital.com.br',
};

export const mockSellers: CieloSeller[] = [
  {
    id: '5dcee8e4-f432-42e4-a2a6-5a30c8ce2ca5',
    document_type: 'CNPJ',
    document_number: '61805098000149',
    fancy_name: 'Padaria Pão Quente',
  },
  {
    id: '0b6f6a8e-1f8a-4a3c-9a55-2c0f1f6c8d21',
    document_type: 'CPF',
    document_number: '52839789801',
    fancy_name: 'Salão da Ana',
  },
  {
    id: 'c3b1f2d4-7e6a-4f0b-8c2d-9a1e5b7c3d40',
    document_type: 'CNPJ',
    document_number: '12ABC34501DE35',
    fancy_name: 'Mercadinho Bom Preço',
  },
];
