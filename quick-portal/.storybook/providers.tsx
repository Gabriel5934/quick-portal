import { createContext, useContext, useState } from 'react';
import type { Decorator } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRoute,
  createRootRouteWithContext,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { CieloSeller, Me, Session } from '../src/api/types';
import { sessionQueryKey } from '../src/hooks/auth/session';
import { sellersQueryKey } from '../src/hooks/cielo/useSellers';
import { AuthLayout } from '../src/pages/AuthLayout/AuthLayout';
import type { RouterContext } from '../src/router';
import { mockMe, mockSellers, mockSession } from './fixtures';

const StoryContent = createContext<React.ReactNode>(null);

function RenderStory() {
  return <>{useContext(StoryContent)}</>;
}

type ProviderOptions = {
  session?: Session | null;
  me?: Me;
  sellers?: CieloSeller[];
};

function StoryProviders({
  children,
  options,
}: {
  children: React.ReactNode;
  options: ProviderOptions;
}) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(
      sessionQueryKey,
      options.session === undefined ? mockSession() : options.session
    );
    client.setQueryData(['auth', 'me'], options.me ?? mockMe);
    client.setQueryData(sellersQueryKey, options.sellers ?? mockSellers);
    return client;
  });
  // A memory router so Link and useNavigate work inside stories. Its routes
  // match any path, because stories navigate to app routes such as /inicio.
  const [router] = useState(() => {
    const rootRoute = createRootRouteWithContext<RouterContext>()({ component: RenderStory });
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' });
    const anyPathRoute = createRoute({ getParentRoute: () => rootRoute, path: '$' });
    return createRouter({
      routeTree: rootRoute.addChildren([indexRoute, anyPathRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: { queryClient },
    });
  });

  return (
    <QueryClientProvider client={queryClient}>
      <StoryContent.Provider value={children}>
        <RouterProvider router={router} />
      </StoryContent.Provider>
    </QueryClientProvider>
  );
}

/** Query cache seeded with fixtures plus a router context. */
export const withAppProviders =
  (options: ProviderOptions = {}): Decorator =>
  (Story) => (
    <StoryProviders options={options}>
      <Story />
    </StoryProviders>
  );

/** Renders the story inside the authenticated layout, as its route does. */
export const withAuthLayout: Decorator = (Story) => (
  <AuthLayout>
    <Story />
  </AuthLayout>
);
