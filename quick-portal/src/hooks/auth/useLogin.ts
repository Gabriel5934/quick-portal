import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LoginInput } from '@/api/types';
import { unwrap } from '@/lib/api-error';
import { loginFn } from '@/server/quick-api';
import { clearUserData, sessionQueryKey } from './session';

/** `POST /auth/login`; stores the access token in the query cache. */
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput) => unwrap(await loginFn({ data: input })),
    onSuccess: (session) => {
      clearUserData(queryClient);
      queryClient.setQueryData(sessionQueryKey, session);
    },
  });
}
