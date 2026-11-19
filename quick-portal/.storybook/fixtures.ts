import type { Business, CieloSeller, Me, Session } from '../src/api/types';

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

export const mockBusinesses: Business[] = [
  {
    id: '7a1d3c5e-2b4f-4a6c-8e0d-1f3b5d7f9a2c',
    cnpj: '61805098000149',
    client_id: 'qp_storybook_client_id',
  },
  { id: '8b2e4d6f-3c5a-4b7d-9f1e-2a4c6e8a0b3d', cnpj: '12ABC34501DE35', client_id: null },
];
