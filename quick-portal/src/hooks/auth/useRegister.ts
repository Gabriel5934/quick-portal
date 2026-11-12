import { useMutation } from '@tanstack/react-query';
import type { RegisterInput } from '@/api/types';
import { unwrap } from '@/lib/api-error';
import { registerFn } from '@/server/quick-api';

/** `POST /auth/register`; does not sign in, so the session cache is untouched. */
export function useRegister() {
  return useMutation({
    mutationFn: async (input: RegisterInput) => unwrap(await registerFn({ data: input })),
  });
}
