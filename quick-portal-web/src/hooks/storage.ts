// Tokens are never persisted: the access token lives in the TanStack Query
// cache and the refresh token in an HttpOnly cookie set by the API. The only
// localStorage keys are the user email, the session generation and the
// pending logout flag, and none of them holds a secret.
const USER_EMAIL_KEY = "userEmail";

/**
 * Session generation: a plain counter that holds no secret. Login increments
 * it while holding the refresh lock, and logout compares it to the value it
 * captured when it started. Since localStorage is shared by every tab of the
 * origin, this is what lets logout see a login made in another tab and skip a
 * request that would blacklist that login's refresh cookie.
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

/**
 * Pending logout flag: the session generation captured when a logout started,
 * kept until the logout request gets a 2xx (or is skipped because a login
 * replaced the refresh cookie). While it is set, the app's boot does not
 * refresh with the cookie that logout meant to blacklist: it sends the logout
 * request again instead. A login removes it.
 *
 * This is a UX and consistency measure, not a security control. The refresh
 * cookie stays valid on the server until a logout reaches the API (or it
 * expires), and anyone who can clear localStorage or call the refresh
 * endpoint directly can still use it.
 */
const PENDING_LOGOUT_KEY = "pendingLogout";

/**
 * The generation stored by a pending logout, or `null` when there is none.
 * A missing, invalid or unreadable value reads as "no pending logout": the
 * app then falls back to the normal boot refresh.
 */
export function getPendingLogout(): number | null {
  try {
    const value = localStorage.getItem(PENDING_LOGOUT_KEY);
    if (value === null || !/^\d+$/.test(value)) return null;
    const generation = Number(value);
    return Number.isSafeInteger(generation) ? generation : null;
  } catch {
    return null;
  }
}

/** Marks a logout as pending until its request succeeds. */
export function setPendingLogout(generation: number): void {
  try {
    localStorage.setItem(PENDING_LOGOUT_KEY, String(generation));
  } catch {
    // Storage unavailable: the next load falls back to the normal boot
    // refresh, which can restore the session if this logout never succeeds.
  }
}

/**
 * Removes the pending logout flag. With `generation`, only a flag stored by a
 * logout that started at that generation is removed, so a logout that ends
 * never removes the flag of a newer one. Login removes it unconditionally.
 */
export function clearPendingLogout(generation?: number): void {
  try {
    if (
      generation === undefined ||
      localStorage.getItem(PENDING_LOGOUT_KEY) === String(generation)
    ) {
      localStorage.removeItem(PENDING_LOGOUT_KEY);
    }
  } catch {
    // Storage unavailable: nothing was stored, or a stale flag stays until
    // storage works again, and the next load resends a harmless logout.
  }
}
