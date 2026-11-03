import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { OnboardPayload } from '@/api/types';
import { withAccessToken } from '@/hooks/auth/session';
import { onboardSellerFn } from '@/server/quick-api';
import { sellersQueryKey } from './useSellers';

/** `POST /cielo/onboard`. */
export function useOnboardSeller() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: OnboardPayload) =>
      withAccessToken(queryClient, (accessToken) =>
        onboardSellerFn({ data: { accessToken, payload } })
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sellersQueryKey }),
  });
}
