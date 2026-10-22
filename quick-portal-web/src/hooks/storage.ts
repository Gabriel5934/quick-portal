// Tokens are never persisted: the access token lives in the TanStack Query
// cache and the refresh token in an HttpOnly cookie set by the API.
const USER_EMAIL_KEY = "userEmail";

// Keys written by earlier versions that kept both JWTs in localStorage.
const LEGACY_TOKEN_KEYS = ["token", "refreshToken"];

export function getUserEmail(): string | null {
  return localStorage.getItem(USER_EMAIL_KEY);
}

export function setUserEmail(email: string): void {
  localStorage.setItem(USER_EMAIL_KEY, email.trim().toLowerCase());
}

export function clearUserEmail(): void {
  localStorage.removeItem(USER_EMAIL_KEY);
}

export function removeLegacyTokens(): void {
  for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
}
