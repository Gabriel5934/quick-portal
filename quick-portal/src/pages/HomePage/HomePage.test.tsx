import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@test-utils';
import { renderToString } from 'react-dom/server';
import { vi } from 'vite-plus/test';
import type { Business } from '@/api/types';
import { sessionQueryKey } from '@/hooks/auth/session';
import {
  resetSelectedBusiness,
  SELECTED_BUSINESS_STORAGE_KEY,
} from '@/hooks/business/selection-store';
import { HomePage } from './HomePage';

const { getBusinessesFn } = vi.hoisted(() => ({ getBusinessesFn: vi.fn() }));

vi.mock('@/server/quick-api', () => ({ getBusinessesFn, refreshSessionFn: vi.fn() }));

const BUSINESSES: Business[] = [{ id: '1', cnpj: '61805098000149' }];

function page() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(sessionQueryKey, {
    accessToken: 'token',
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  return (
    <QueryClientProvider client={queryClient}>
      <div data-testid="body">
        <HomePage />
      </div>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  resetSelectedBusiness();
  window.sessionStorage.clear();
  getBusinessesFn.mockReset().mockResolvedValue({ ok: true, data: BUSINESSES });
});

describe('HomePage', () => {
  it('renders nothing while the selection is unknown', () => {
    expect(renderToString(page())).toBe('<div data-testid="body"></div>');
  });

  it('asks for a business when none is selected', async () => {
    render(page());
    expect(
      await screen.findByText('Selecione um negócio para visualizar as informações.')
    ).toBeInTheDocument();
  });

  it('says no business is available when the list is empty', async () => {
    getBusinessesFn.mockResolvedValue({ ok: true, data: [] });
    render(page());
    expect(await screen.findByText('Nenhum negócio disponível.')).toBeInTheDocument();
  });

  it('renders nothing when a business is selected', async () => {
    window.sessionStorage.setItem(SELECTED_BUSINESS_STORAGE_KEY, '61805098000149');
    render(page());
    await waitFor(() => expect(getBusinessesFn).toHaveBeenCalled());
    // Let the list resolve before asserting.
    await act(async () => {});
    expect(screen.getByTestId('body')).toBeEmptyDOMElement();
  });
});
