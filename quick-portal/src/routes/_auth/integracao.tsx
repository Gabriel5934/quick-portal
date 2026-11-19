import { createFileRoute } from '@tanstack/react-router';
import { IntegrationPage } from '@/pages/IntegrationPage/IntegrationPage';

export const Route = createFileRoute('/_auth/integracao')({
  ssr: true,
  head: () => ({ meta: [{ title: 'Integração | Quick Portal' }] }),
  component: IntegrationPage,
});
