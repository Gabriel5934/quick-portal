import { isNormalizedCnpj, normalizeCnpj } from '@/lib/cnpj';

export const SELECTED_BUSINESS_STORAGE_KEY = 'quick-portal.selected-business';

/**
 * The selected business CNPJ, shared by every component in the tab and kept in
 * sessionStorage. `undefined` means it was not read yet (always the case on
 * the server, which has no sessionStorage), `null` means no selection.
 */
let selection: string | null | undefined;
const listeners = new Set<() => void>();

function setSelection(value: string | null | undefined): void {
  selection = value;
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function removeStoredSelection(): void {
  try {
    window.sessionStorage.removeItem(SELECTED_BUSINESS_STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to remove.
  }
}

/** The stored CNPJ, or `null` when there is none, it is invalid or storage fails. */
function readStoredSelection(): string | null {
  let stored: string | null;
  try {
    stored = window.sessionStorage.getItem(SELECTED_BUSINESS_STORAGE_KEY);
  } catch {
    return null;
  }
  if (stored === null) {
    return null;
  }
  const value = stored.toUpperCase();
  if (!isNormalizedCnpj(value)) {
    removeStoredSelection();
    return null;
  }
  return value;
}

/** Selects a business. Returns false (and changes nothing) for an invalid CNPJ. */
export function selectBusiness(raw: string): boolean {
  const cnpj = normalizeCnpj(raw);
  if (!cnpj) {
    return false;
  }
  try {
    window.sessionStorage.setItem(SELECTED_BUSINESS_STORAGE_KEY, cnpj);
  } catch {
    // Storage unavailable: the selection lasts until the page reloads.
  }
  setSelection(cnpj);
  return true;
}

/** Clears the selection. */
export function clearSelectedBusiness(): void {
  removeStoredSelection();
  setSelection(null);
}

/** Forgets the selection on sign-out; mounted components read storage again. */
export function resetSelectedBusiness(): void {
  removeStoredSelection();
  setSelection(undefined);
}

export function getSelection(): string | null | undefined {
  return selection;
}

/** Applies what sessionStorage holds. */
export function loadSelectedBusiness(): void {
  setSelection(readStoredSelection());
}
