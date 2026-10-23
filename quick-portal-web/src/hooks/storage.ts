// Tokens are never persisted: the access token lives in the TanStack Query
// cache and the refresh token in an HttpOnly cookie set by the API.
const USER_EMAIL_KEY = "userEmail";

export function getUserEmail(): string | null {
  return localStorage.getItem(USER_EMAIL_KEY);
}

export function setUserEmail(email: string): void {
  localStorage.setItem(USER_EMAIL_KEY, email.trim().toLowerCase());
}

export function clearUserEmail(): void {
  localStorage.removeItem(USER_EMAIL_KEY);
}
