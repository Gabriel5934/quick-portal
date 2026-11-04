import { createFileRoute, redirect } from '@tanstack/react-router';
import { sessionQueryOptions } from '@/hooks/auth/session';
import { LoginPage } from '@/pages/LoginPage/LoginPage';

export const Route = createFileRoute('/')({
  ssr: true,
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.query(sessionQueryOptions());
    if (session) {
      throw redirect({ to: '/inicio' });
    }
  },
  head: () => ({ meta: [{ title: 'Entrar | Quick Portal' }] }),
  component: LoginPage,
});
