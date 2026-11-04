import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { sessionQueryOptions } from '@/hooks/auth/session';
import { meQueryOptions } from '@/hooks/auth/useMe';
import { AuthLayout } from '@/pages/AuthLayout/AuthLayout';
import { redirectOnUnauthorized } from './-redirect-on-unauthorized';

/** Pathless layout for every route that requires a signed-in user. */
export const Route = createFileRoute('/_auth')({
  ssr: true,
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.query(sessionQueryOptions());
    if (!session) {
      throw redirect({ to: '/' });
    }
  },
  loader: ({ context }) =>
    redirectOnUnauthorized(context.queryClient.query(meQueryOptions(context.queryClient))),
  component: () => (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  ),
});
