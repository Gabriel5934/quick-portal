import { redirect } from '@tanstack/react-router';
import { isUnauthorized } from '@/lib/api-error';

/** Sends the user back to the login page when Quick API rejects the token. */
export async function redirectOnUnauthorized<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isUnauthorized(error)) {
      throw redirect({ to: '/' });
    }
    throw error;
  }
}
