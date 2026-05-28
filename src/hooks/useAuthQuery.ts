import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import { ApiError } from "./types";

export { ApiError };

export function useAuthQuery<TData>(
  options: Omit<UseQueryOptions<TData>, "retry">,
) {
  const queryClient = useQueryClient();

  return useQuery<TData>({
    ...options,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 401) {
        void queryClient.invalidateQueries({ queryKey: ["access_token"] });
        return failureCount < 1;
      }
      return failureCount < 3;
    },
  });
}
