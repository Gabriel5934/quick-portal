import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 64;

/** Length in Unicode code points, matching the backend (an emoji counts as one). */
export function passwordLength(value: string): number {
  // Code points on purpose: the backend counts them, not grapheme clusters.
  // oxlint-disable-next-line typescript/no-misused-spread
  return [...value].length;
}

/**
 * Password policy shared by every flow that sets a password. Any character is
 * allowed (unicode and whitespace included), nothing is trimmed and there are
 * no character-class rules; only the length in code points is enforced.
 */
export const passwordSchema = z
  .string()
  .min(1, 'Informe a senha')
  .refine(
    (value) => value.length === 0 || passwordLength(value) >= PASSWORD_MIN_LENGTH,
    `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres`
  )
  .refine(
    (value) => passwordLength(value) <= PASSWORD_MAX_LENGTH,
    `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres`
  );
