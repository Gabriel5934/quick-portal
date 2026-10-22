import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import { ApiError } from "#hooks/types";
import { ACCESS_TOKEN_QUERY_KEY } from "./session";

export { ApiError };

export function useAuthQuery<TData>(
  options: Omit<UseQueryOptions<TData>, "retry">,
) {
  const queryClient = useQueryClient();

  return useQuery<TData>({
    ...options,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) {
        void queryClient.invalidateQueries({
          queryKey: ACCESS_TOKEN_QUERY_KEY,
        });
        return failureCount < 1;
      }
      return failureCount < 3;
    },
  });
}
