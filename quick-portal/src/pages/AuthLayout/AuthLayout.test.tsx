import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@test-utils';
import { renderToString } from 'react-dom/server';
import { vi } from 'vite-plus/test';
import { MantineProvider } from '@mantine/core';
import type { Business } from '@/api/types';
import { sessionQueryKey } from '@/hooks/auth/session';
import {
  resetSelectedBusiness,
  SELECTED_BUSINESS_STORAGE_KEY,
} from '@/hooks/business/selection-store';
import { theme } from '@/theme';
import { AuthLayout } from './AuthLayout';

const { getBusinessesFn } = vi.hoisted(() => ({ getBusinessesFn: vi.fn() }));

vi.mock('@/server/quick-api', () => ({
  getBusinessesFn,
  getMeFn: vi.fn(),
  logoutFn: vi.fn(),
  refreshSessionFn: vi.fn(),
}));

// The layout only needs a link and navigation, not a whole router.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(() => Promise.resolve()),
}));

const BUSINESSES: Business[] = [{ id: '1', cnpj: '61805098000149' }];

function layout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(sessionQueryKey, {
    accessToken: 'token',
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  queryClient.setQueryData(['auth', 'me'], { id: '1', email: 'gabriel@example.com' });
  return (
    <QueryClientProvider client={queryClient}>
      <AuthLayout>
        <div>conteudo</div>
      </AuthLayout>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  resetSelectedBusiness();
  window.sessionStorage.clear();
  getBusinessesFn.mockReset().mockResolvedValue({ ok: true, data: BUSINESSES });
});

describe('AuthLayout', () => {
  it('renders no content while the selection is unknown', () => {
    const html = renderToString(
      <MantineProvider theme={theme} env="test">
        {layout()}
      </MantineProvider>
    );
    expect(html).toMatch(/<main[^>]*><\/main>/);
    expect(html).not.toContain('conteudo');
  });

  it('asks for a business when none is selected', async () => {
    render(layout());
    expect(
      await screen.findByText('Selecione um empresa para visualizar as informações.')
    ).toBeInTheDocument();
    expect(screen.queryByText('conteudo')).not.toBeInTheDocument();
  });

  it('says no business is available when the list is empty', async () => {
    getBusinessesFn.mockResolvedValue({ ok: true, data: [] });
    render(layout());
    expect(await screen.findByText('Você não tem acesso a nenhuma empresa')).toBeInTheDocument();
    expect(screen.queryByText('conteudo')).not.toBeInTheDocument();
  });

  it('renders the content when a business is selected', async () => {
    window.sessionStorage.setItem(SELECTED_BUSINESS_STORAGE_KEY, '61805098000149');
    render(layout());
    expect(await screen.findByText('conteudo')).toBeInTheDocument();
    expect(screen.queryByText('Você não tem acesso a nenhuma empresa')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Selecione um empresa para visualizar as informações.')
    ).not.toBeInTheDocument();
  });
});
