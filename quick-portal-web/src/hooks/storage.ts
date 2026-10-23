// Tokens are never persisted: the access token lives in the TanStack Query
// cache and the refresh token in an HttpOnly cookie set by the API.
const USER_EMAIL_KEY = "userEmail";

/**
 * Session generation: the only value kept in localStorage besides the user
 * email. It is a plain counter and holds no secret. Login increments it while
 * holding the refresh lock, and logout compares it to the value it captured
 * when it started. Since localStorage is shared by every tab of the origin,
 * this is what lets logout see a login made in another tab and skip a request
 * that would blacklist that login's refresh cookie.
 */
const SESSION_GENERATION_KEY = "sessionGeneration";

export function getUserEmail(): string | null {
  return localStorage.getItem(USER_EMAIL_KEY);
}

export function setUserEmail(email: string): void {
  localStorage.setItem(USER_EMAIL_KEY, email.trim().toLowerCase());
}

export function clearUserEmail(): void {
  localStorage.removeItem(USER_EMAIL_KEY);
}

/** The current session generation; `0` when missing, invalid or unreadable. */
export function getSessionGeneration(): number {
  try {
    const value = Number(localStorage.getItem(SESSION_GENERATION_KEY));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** Marks that a login happened. Call it only while holding the refresh lock. */
export function bumpSessionGeneration(): void {
  try {
    localStorage.setItem(
      SESSION_GENERATION_KEY,
      String(getSessionGeneration() + 1),
    );
  } catch {
    // Storage unavailable: logout falls back to this tab's token cache.
  }
}
