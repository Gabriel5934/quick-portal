import {
  queryOptions,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { withAccessToken } from '@/hooks/auth/session';
import { getSellersFn } from '@/server/quick-api';

export const sellersQueryKey = ['cielo', 'sellers'] as const;

export function sellersQueryOptions(queryClient: QueryClient) {
  return queryOptions({
    queryKey: sellersQueryKey,
    queryFn: () =>
      withAccessToken(queryClient, (accessToken) => getSellersFn({ data: { accessToken } })),
  });
}

/** `GET /cielo/get-sellers`. Loaded on the server by the /inicio loader. */
export function useSellers() {
  const queryClient = useQueryClient();
  return useSuspenseQuery(sellersQueryOptions(queryClient));
}
