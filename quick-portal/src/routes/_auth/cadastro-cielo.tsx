import { createFileRoute } from '@tanstack/react-router';
import { OnboardingPage } from '@/pages/OnboardingPage/OnboardingPage';

export const Route = createFileRoute('/_auth/cadastro-cielo')({
  ssr: true,
  head: () => ({ meta: [{ title: 'Cadastrar Cielo | Quick Portal' }] }),
  component: OnboardingPage,
});
