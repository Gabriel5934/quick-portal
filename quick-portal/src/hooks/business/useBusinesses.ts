import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { withAccessToken } from '@/hooks/auth/session';
import { getBusinessesFn } from '@/server/quick-api';

export const businessesQueryKey = ['business', 'list'] as const;

export function businessesQueryOptions(queryClient: QueryClient) {
  return queryOptions({
    queryKey: businessesQueryKey,
    queryFn: () =>
      withAccessToken(queryClient, (accessToken) => getBusinessesFn({ data: { accessToken } })),
  });
}

/** `GET /businesses`: the businesses the signed-in user belongs to. */
export function useBusinesses() {
  const queryClient = useQueryClient();
  return useQuery(businessesQueryOptions(queryClient));
}
