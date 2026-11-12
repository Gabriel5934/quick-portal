import { z } from 'zod';
import { evaluatePassword } from './strength';

export const PWNED_PASSWORD_MESSAGE = 'Essa senha foi encontrada em um vazamento de dados';

/**
 * Adds an async Have I Been Pwned check to a password schema. It runs only after
 * `schema` passes, so it needs `parseAsync` (the default mode of `zodResolver`)
 * and reports on the field the schema is placed in.
 */
export function withPwnedCheck(schema: z.ZodType<string, string>) {
  return schema.pipe(
    z.string().refine(async (password) => {
      const evaluation = await evaluatePassword(password);
      return !evaluation?.pwned;
    }, PWNED_PASSWORD_MESSAGE)
  );
}
