import { z } from 'zod';
import { passwordSchema } from '@/lib/password/policy';
import { withPwnedCheck } from '@/lib/password/pwned-check';

export const TURNSTILE_REQUIRED_MESSAGE = 'Confirme que você não é um robô';

/** Registration form schema. The pwned check is async, so parse with `parseAsync`. */
export function createRegisterSchema() {
  return z.object({
    email: z.string().trim().min(1, 'Informe o e-mail').pipe(z.email('E-mail inválido')),
    password: withPwnedCheck(passwordSchema),
    turnstile_token: z.string().min(1, TURNSTILE_REQUIRED_MESSAGE),
  });
}

export type RegisterValues = z.input<ReturnType<typeof createRegisterSchema>>;
