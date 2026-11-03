/**
 * Server functions: the only code that talks to Quick API.
 *
 * Every Quick API request runs on the TanStack Start server, so the browser
 * never calls Quick API directly (no CORS needed) and the server can read the
 * refresh token during SSR. Quick API's refresh cookie (`refresh_token`,
 * Path=/auth on the API host) is captured here and re-issued as this app's own
 * HttpOnly cookie, so JavaScript never sees the refresh token. The short-lived
 * access token is returned to the caller, which keeps it in the TanStack Query
 * cache and passes it back with each request.
 *
 * Storybook aliases this module to `.storybook/mocks/quick-api.ts`; keep the
 * exports in sync.
 */

import { createServerFn } from '@tanstack/react-start';
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server';
import { z } from 'zod';
import type { CieloSeller, Me, OnboardPayload, Session } from '@/api/types';
import { describeApiError, type ApiResult } from '@/lib/api-error';

const REFRESH_COOKIE = 'quick_portal_refresh';
const QUICK_API_REFRESH_COOKIE = 'refresh_token';
// Required by /auth/refresh and /auth/logout (quick-api/app/auth/deps.py).
const CSRF_HEADERS = { 'X-Requested-With': 'quick-portal' };
const DEFAULT_TIMEOUT_MS = 15_000;
// Quick API waits up to 120 s for Cielo.
const ONBOARD_TIMEOUT_MS = 130_000;

function apiUrl(path: string): string {
  const base = (process.env.QUICK_API_URL || 'http://localhost:8100').replace(/\/+$/, '');
  return `${base}${path}`;
}

type RawResponse = { status: number; body: unknown; response: Response };

async function request(
  path: string,
  init: RequestInit & { timeoutMs?: number | null } = {}
): Promise<RawResponse | null> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  try {
    const response = await fetch(apiUrl(path), {
      ...rest,
      // No timeout for refresh: an aborted refresh may already have rotated
      // the token server side.
      signal: timeoutMs === null ? undefined : AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body, response };
  } catch {
    // Network failure or timeout.
    return null;
  }
}

function failure(raw: RawResponse | null): { ok: false; status: number; message: string } {
  if (!raw) {
    return { ok: false, status: 0, message: 'Não foi possível conectar à Quick API.' };
  }
  return { ok: false, status: raw.status, message: describeApiError(raw.status, raw.body) };
}

function bearer(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Reads Quick API's refresh cookie from a response's Set-Cookie headers. */
function readRefreshCookie(response: Response): { value: string; maxAge?: number } | null {
  for (const header of response.headers.getSetCookie()) {
    const [pair, ...attributes] = header.split(';');
    const separator = pair.indexOf('=');
    if (separator < 0 || pair.slice(0, separator).trim() !== QUICK_API_REFRESH_COOKIE) {
      continue;
    }
    const value = pair
      .slice(separator + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1');
    if (!value) {
      return null;
    }
    const maxAge = attributes
      .map((attribute) => attribute.trim().split('='))
      .find(([name]) => name.toLowerCase() === 'max-age')?.[1];
    return { value, maxAge: maxAge ? Number(maxAge) : undefined };
  }
  return null;
}

const cookieOptions = () =>
  ({
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  }) as const;

function storeRefreshCookie(response: Response): void {
  const cookie = readRefreshCookie(response);
  if (cookie) {
    setCookie(REFRESH_COOKIE, cookie.value, { ...cookieOptions(), maxAge: cookie.maxAge });
  }
}

function clearRefreshCookie(): void {
  deleteCookie(REFRESH_COOKIE, cookieOptions());
}

function toSession(body: unknown): Session {
  const { access_token: accessToken, expires_in: expiresIn } = body as {
    access_token: string;
    expires_in: number;
  };
  return { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
}

const loginSchema = z.object({ email: z.string(), password: z.string() });
const tokenSchema = z.object({ accessToken: z.string().min(1) });

/** `POST /auth/login`. */
export const loginFn = createServerFn({ method: 'POST' })
  .validator(loginSchema)
  .handler(async ({ data }): Promise<ApiResult<Session>> => {
    const raw = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!raw || raw.status !== 200) {
      return failure(raw);
    }
    storeRefreshCookie(raw.response);
    return { ok: true, data: toSession(raw.body) };
  });

/**
 * `POST /auth/refresh` with the stored refresh cookie. Resolves to `null` when
 * there is no session (no cookie, or Quick API rejected it with 401).
 */
export const refreshSessionFn = createServerFn({ method: 'POST' }).handler(
  async (): Promise<ApiResult<Session | null>> => {
    const refreshToken = getCookie(REFRESH_COOKIE);
    if (!refreshToken) {
      return { ok: true, data: null };
    }
    const raw = await request('/auth/refresh', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        Cookie: `${QUICK_API_REFRESH_COOKIE}=${refreshToken}`,
      },
      timeoutMs: null,
    });
    if (raw?.status === 401) {
      clearRefreshCookie();
      return { ok: true, data: null };
    }
    if (!raw || raw.status !== 200) {
      return failure(raw);
    }
    storeRefreshCookie(raw.response);
    return { ok: true, data: toSession(raw.body) };
  }
);

/** `POST /auth/logout`. The local cookie is cleared even if Quick API fails. */
export const logoutFn = createServerFn({ method: 'POST' }).handler(
  async (): Promise<ApiResult<null>> => {
    const refreshToken = getCookie(REFRESH_COOKIE);
    clearRefreshCookie();
    if (!refreshToken) {
      return { ok: true, data: null };
    }
    const raw = await request('/auth/logout', {
      method: 'POST',
      headers: {
        ...CSRF_HEADERS,
        Cookie: `${QUICK_API_REFRESH_COOKIE}=${refreshToken}`,
      },
    });
    if (!raw || raw.status !== 204) {
      return failure(raw);
    }
    return { ok: true, data: null };
  }
);

/** `GET /auth/me`. */
export const getMeFn = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(async ({ data }): Promise<ApiResult<Me>> => {
    const raw = await request('/auth/me', { headers: bearer(data.accessToken) });
    if (!raw || raw.status !== 200) {
      return failure(raw);
    }
    return { ok: true, data: raw.body as Me };
  });

/** `GET /cielo/get-sellers`. */
export const getSellersFn = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(async ({ data }): Promise<ApiResult<CieloSeller[]>> => {
    const raw = await request('/cielo/get-sellers', { headers: bearer(data.accessToken) });
    if (!raw || raw.status !== 200) {
      return failure(raw);
    }
    return { ok: true, data: raw.body as CieloSeller[] };
  });

/** `POST /cielo/onboard`. Quick API validates the payload (422) and relays Cielo's errors. */
export const onboardSellerFn = createServerFn({ method: 'POST' })
  .validator((data: { accessToken: string; payload: OnboardPayload }) => data)
  .handler(async ({ data }): Promise<ApiResult<CieloSeller>> => {
    const raw = await request('/cielo/onboard', {
      method: 'POST',
      headers: { ...bearer(data.accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify(data.payload),
      timeoutMs: ONBOARD_TIMEOUT_MS,
    });
    if (!raw || raw.status !== 201) {
      return failure(raw);
    }
    return { ok: true, data: raw.body as CieloSeller };
  });
