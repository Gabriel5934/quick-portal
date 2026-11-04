import { useQuery } from '@tanstack/react-query';
import { sessionQueryOptions } from './session';

/** The current session (access token) from the query cache; `null` when signed out. */
export function useSession() {
  return useQuery(sessionQueryOptions());
}
