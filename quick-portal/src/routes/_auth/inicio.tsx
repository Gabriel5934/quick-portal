import { createFileRoute } from '@tanstack/react-router';
import { sellersQueryOptions } from '@/hooks/cielo/useSellers';
import { HomePage } from '@/pages/HomePage/HomePage';
import { redirectOnUnauthorized } from '../-redirect-on-unauthorized';

export const Route = createFileRoute('/_auth/inicio')({
  ssr: true,
  // Runs on the server for the first request, so the table is server rendered.
  loader: ({ context }) =>
    redirectOnUnauthorized(context.queryClient.query(sellersQueryOptions(context.queryClient))),
  head: () => ({ meta: [{ title: 'Início | Quick Portal' }] }),
  component: HomePage,
});
