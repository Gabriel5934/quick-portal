/**
 * Minimal input masks.
 *
 * Pattern tokens: `0` is a digit, `X` is a letter or digit (letters are
 * uppercased). Any other character is a literal inserted automatically.
 */

const TOKENS: Record<string, RegExp> = {
  '0': /\d/,
  X: /[A-Z0-9]/,
};

function isToken(char: string): boolean {
  return char in TOKENS;
}

/** Applies `pattern` to `value`, dropping characters the pattern rejects. */
export function applyMask(value: string, pattern: string): string {
  const alphanumeric = pattern.includes('X');
  const raw = (
    alphanumeric ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : value.replace(/\D/g, '')
  ).split('');

  let result = '';
  let pending = '';
  let rawIndex = 0;

  for (const char of pattern) {
    if (rawIndex >= raw.length) {
      break;
    }
    if (!isToken(char)) {
      // Literals are only written once the next token has a character.
      pending += char;
      continue;
    }
    // Skip input characters the token does not accept (e.g. a letter for `0`).
    while (rawIndex < raw.length && !TOKENS[char].test(raw[rawIndex])) {
      rawIndex += 1;
    }
    if (rawIndex >= raw.length) {
      break;
    }
    result += pending + raw[rawIndex];
    pending = '';
    rawIndex += 1;
  }

  return result;
}

/** Removes every literal of the pattern, keeping only letters and digits. */
export function unmask(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const MASKS = {
  phone: '(00) 00000-0000',
  cpf: 'XXX.XXX.XXX-XX',
  cnpj: 'XX.XXX.XXX/XXXX-XX',
  date: '00/00/0000',
  zipCode: '00000-000',
} as const;

export type DocumentType = 'CPF' | 'CNPJ';

export function documentMask(type: DocumentType): string {
  return type === 'CPF' ? MASKS.cpf : MASKS.cnpj;
}

/** Number of letters/digits a pattern holds. */
export function maskLength(pattern: string): number {
  return pattern.split('').filter(isToken).length;
}

export function formatDocument(documentNumber: string, type: DocumentType): string {
  return applyMask(documentNumber, documentMask(type));
}
