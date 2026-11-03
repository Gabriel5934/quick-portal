import { useMutation, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@/lib/api-error';
import { logoutFn } from '@/server/quick-api';
import { sessionQueryKey } from './session';

/**
 * `POST /auth/logout`. The refresh cookie is cleared by the server function
 * even when Quick API fails, so the local session is always dropped.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await logoutFn()),
    onSettled: () => {
      queryClient.setQueryData(sessionQueryKey, null);
    },
  });
}
