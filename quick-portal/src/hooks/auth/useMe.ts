import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { getMeFn } from '@/server/quick-api';
import { withAccessToken } from './session';

export function meQueryOptions(queryClient: QueryClient) {
  return queryOptions({
    queryKey: ['auth', 'me'] as const,
    queryFn: () =>
      withAccessToken(queryClient, (accessToken) => getMeFn({ data: { accessToken } })),
    staleTime: Infinity,
  });
}

/** `GET /auth/me`: the signed-in user. Loaded by the auth layout's loader. */
export function useMe() {
  const queryClient = useQueryClient();
  return useSuspenseQuery(meQueryOptions(queryClient));
}
