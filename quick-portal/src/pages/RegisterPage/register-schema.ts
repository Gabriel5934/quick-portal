import { z } from 'zod';
import { passwordSchema } from '@/lib/password/policy';
import { withPwnedCheck } from '@/lib/password/pwned-check';

/** Registration form schema. The pwned check is async, so parse with `parseAsync`. */
export function createRegisterSchema() {
  return z.object({
    email: z.string().trim().min(1, 'Informe o e-mail').pipe(z.email('E-mail inválido')),
    password: withPwnedCheck(passwordSchema),
  });
}

export type RegisterValues = z.input<ReturnType<typeof createRegisterSchema>>;
