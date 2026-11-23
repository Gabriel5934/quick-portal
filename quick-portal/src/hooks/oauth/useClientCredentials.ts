import { useMutation, useQueryClient } from '@tanstack/react-query';
import { withAccessToken } from '@/hooks/auth/session';
import { generateCredentialsFn, rotateCredentialsFn } from '@/server/quick-api';

/**
 * Both responses can carry a plaintext client secret, so they are mutations
 * that are never cached: no query key, no retry, and the mutation is dropped
 * from the mutation cache as soon as nothing observes it. Callers copy the
 * secret into component state and `reset()` the mutation right away.
 */
const NO_CACHE = { gcTime: 0, retry: false } as const;

/** `POST /oauth/generate` for the given business CNPJ. */
export function useGenerateCredentials() {
  const queryClient = useQueryClient();
  return useMutation({
    ...NO_CACHE,
    mutationFn: (businessCnpj: string) =>
      withAccessToken(queryClient, (accessToken) =>
        generateCredentialsFn({ data: { accessToken, businessCnpj } })
      ),
  });
}

/** `POST /oauth/rotate` for the given business CNPJ. */
export function useRotateCredentials() {
  const queryClient = useQueryClient();
  return useMutation({
    ...NO_CACHE,
    mutationFn: (businessCnpj: string) =>
      withAccessToken(queryClient, (accessToken) =>
        rotateCredentialsFn({ data: { accessToken, businessCnpj } })
      ),
  });
}
