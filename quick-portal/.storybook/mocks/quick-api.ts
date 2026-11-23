/**
 * Storybook stand-in for `src/server/quick-api.ts` (aliased in main.ts). Same
 * exports and call signatures, resolved with fixtures.
 */

import type {
  Business,
  CieloSeller,
  ClientCredentials,
  GenerateCredentialsResult,
  LoginInput,
  Me,
  OnboardPayload,
  RegisteredUser,
  RegisterInput,
  Session,
} from '../../src/api/types';
import type { ApiResult } from '../../src/lib/api-error';
import { mockBusinesses, mockMe, mockSellers, mockSession } from '../fixtures';

const delay = <T>(value: T, ms = 400) =>
  new Promise<T>((resolve) => {
    setTimeout(() => resolve(value), ms);
  });

export const loginFn = (_options: { data: LoginInput }): Promise<ApiResult<Session>> =>
  delay({ ok: true, data: mockSession() });

export const registerFn = ({ data }: { data: RegisterInput }): Promise<ApiResult<RegisteredUser>> =>
  delay({ ok: true, data: { id: '3b6f1e2a-7c4d-4e8f-9a1b-2c3d4e5f6a7b', email: data.email } });

export const refreshSessionFn = (): Promise<ApiResult<Session | null>> =>
  delay({ ok: true, data: mockSession() });

export const logoutFn = (): Promise<ApiResult<null>> => delay({ ok: true, data: null });

export const getMeFn = (_options: { data: { accessToken: string } }): Promise<ApiResult<Me>> =>
  delay({ ok: true, data: mockMe });

export const getBusinessesFn = (_options: {
  data: { accessToken: string };
}): Promise<ApiResult<Business[]>> => delay({ ok: true, data: mockBusinesses });

export const getSellersFn = (_options: {
  data: { accessToken: string };
}): Promise<ApiResult<CieloSeller[]>> => delay({ ok: true, data: mockSellers });

export const onboardSellerFn = ({
  data,
}: {
  data: { accessToken: string; payload: OnboardPayload };
}): Promise<ApiResult<CieloSeller>> =>
  delay({
    ok: true,
    data: {
      id: '9f1c2b3a-4d5e-4f60-8a7b-1c2d3e4f5a6b',
      document_type: data.payload.document_type,
      document_number: data.payload.document_number,
      fancy_name: data.payload.fancy_name,
    },
  });

const mockClientId = 'qp_storybook_client_id';

export const generateCredentialsFn = (_options: {
  data: { accessToken: string; businessCnpj: string };
}): Promise<ApiResult<GenerateCredentialsResult>> =>
  delay({
    ok: true,
    data: {
      status: 'created',
      credentials: { client_id: mockClientId, client_secret: 'storybook-fake-client-secret' },
    },
  });

export const rotateCredentialsFn = (_options: {
  data: { accessToken: string; businessCnpj: string };
}): Promise<ApiResult<ClientCredentials>> =>
  delay({
    ok: true,
    data: { client_id: mockClientId, client_secret: 'storybook-fake-rotated-client-secret' },
  });
