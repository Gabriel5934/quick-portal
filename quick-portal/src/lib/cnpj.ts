/** CNPJs, numeric or alphanumeric. Check digits are left to Quick API. */

const CNPJ_PATTERN = /^[0-9A-Z]{14}$/;

/** True for an already normalized CNPJ: exactly 14 characters of [0-9A-Z]. */
export function isNormalizedCnpj(value: string): boolean {
  return CNPJ_PATTERN.test(value);
}

/**
 * Strips punctuation and uppercases a CNPJ. Returns `null` unless the result
 * is exactly 14 characters of [0-9A-Z].
 */
export function normalizeCnpj(raw: string): string | null {
  const value = raw.replace(/[^0-9a-z]/gi, '').toUpperCase();
  return isNormalizedCnpj(value) ? value : null;
}
