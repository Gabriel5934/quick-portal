import { createFileRoute, redirect } from '@tanstack/react-router';
import { sessionQueryOptions } from '@/hooks/auth/session';
import { RegisterPage } from '@/pages/RegisterPage/RegisterPage';

export const Route = createFileRoute('/cadastro')({
  ssr: true,
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.query(sessionQueryOptions());
    if (session) {
      throw redirect({ to: '/inicio' });
    }
  },
  head: () => ({ meta: [{ title: 'Criar conta | Quick Portal' }] }),
  component: RegisterPage,
});
