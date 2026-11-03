import mantineCoreStyles from '@mantine/core/styles.css?url';
import mantineNotificationsStyles from '@mantine/notifications/styles.css?url';

import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router';
import { ColorSchemeScript, mantineHtmlProps, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import logoUrl from '@/assets/quick-digital-icon.svg?url';
import { ErrorPage } from '@/pages/ErrorPage/ErrorPage';
import type { RouterContext } from '@/router';
import { theme } from '@/theme';

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Quick Portal' },
    ],
    links: [
      { rel: 'stylesheet', href: mantineCoreStyles },
      { rel: 'stylesheet', href: mantineNotificationsStyles },
      { rel: 'icon', type: 'image/svg+xml', href: logoUrl },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
  notFoundComponent: () => <ErrorPage title="Página não encontrada" />,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" />
        <HeadContent />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="light">
          <Notifications position="top-right" />
          {children}
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  );
}
