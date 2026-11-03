/**
 * Storybook stand-in for `src/server/quick-api.ts` (aliased in main.ts). Same
 * exports and call signatures, resolved with fixtures.
 */

import type { CieloSeller, LoginInput, Me, OnboardPayload, Session } from '../../src/api/types';
import type { ApiResult } from '../../src/lib/api-error';
import { mockMe, mockSellers, mockSession } from '../fixtures';

const delay = <T>(value: T, ms = 400) =>
  new Promise<T>((resolve) => {
    setTimeout(() => resolve(value), ms);
  });

export const loginFn = (_options: { data: LoginInput }): Promise<ApiResult<Session>> =>
  delay({ ok: true, data: mockSession() });

export const refreshSessionFn = (): Promise<ApiResult<Session | null>> =>
  delay({ ok: true, data: mockSession() });

export const logoutFn = (): Promise<ApiResult<null>> => delay({ ok: true, data: null });

export const getMeFn = (_options: { data: { accessToken: string } }): Promise<ApiResult<Me>> =>
  delay({ ok: true, data: mockMe });

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
