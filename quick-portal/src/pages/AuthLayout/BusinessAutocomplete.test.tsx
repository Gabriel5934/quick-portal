import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@test-utils';
import { vi } from 'vite-plus/test';
import type { Business } from '@/api/types';
import { sessionQueryKey } from '@/hooks/auth/session';
import {
  resetSelectedBusiness,
  SELECTED_BUSINESS_STORAGE_KEY,
} from '@/hooks/business/selection-store';
import { BusinessAutocomplete } from './BusinessAutocomplete';

const { getBusinessesFn } = vi.hoisted(() => ({ getBusinessesFn: vi.fn() }));

vi.mock('@/server/quick-api', () => ({ getBusinessesFn, refreshSessionFn: vi.fn() }));

const BUSINESSES: Business[] = [
  { id: '1', cnpj: '61805098000149' },
  { id: '2', cnpj: '12abc34501de35' },
];

function renderAutocomplete() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(sessionQueryKey, {
    accessToken: 'token',
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  render(
    <QueryClientProvider client={queryClient}>
      <BusinessAutocomplete />
      <button type="button">Fora</button>
    </QueryClientProvider>
  );
  return screen.getByRole('combobox', { name: 'Selecionar negócio' });
}

beforeEach(() => {
  resetSelectedBusiness();
  window.sessionStorage.clear();
  getBusinessesFn.mockReset().mockResolvedValue({ ok: true, data: BUSINESSES });
});

describe('BusinessAutocomplete', () => {
  it('lists the businesses by uppercase CNPJ', async () => {
    const input = renderAutocomplete();
    await waitFor(() => expect(input).toBeEnabled());
    await userEvent.click(input);
    expect(await screen.findByRole('option', { name: '61805098000149' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '12ABC34501DE35' })).toBeInTheDocument();
  });

  it('stores the selected option', async () => {
    const input = renderAutocomplete();
    await waitFor(() => expect(input).toBeEnabled());
    await userEvent.click(input);
    await userEvent.click(await screen.findByRole('option', { name: '12ABC34501DE35' }));
    expect(input).toHaveValue('12ABC34501DE35');
    expect(window.sessionStorage.getItem(SELECTED_BUSINESS_STORAGE_KEY)).toBe('12ABC34501DE35');
  });

  it('names the open listbox apart from the input', async () => {
    const input = renderAutocomplete();
    await waitFor(() => expect(input).toBeEnabled());
    expect(screen.queryByRole('listbox')).toBeNull();

    await userEvent.click(input);
    const listbox = await screen.findByRole('listbox', { name: 'Lista de negócios' });
    await waitFor(() => expect(input).toHaveAttribute('aria-controls', listbox.id));
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByLabelText('Selecionar negócio')).toEqual([input]);
    expect(screen.queryByRole('listbox', { name: 'Selecionar negócio' })).toBeNull();
  });

  it('hides the listbox from assistive tech after a mouse selection', async () => {
    const input = renderAutocomplete();
    await waitFor(() => expect(input).toBeEnabled());
    await userEvent.click(input);
    await userEvent.click(await screen.findByRole('option', { name: '12ABC34501DE35' }));

    expect(input).toHaveValue('12ABC34501DE35');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getAllByLabelText('Selecionar negócio')).toEqual([input]);
  });

  it('selects with the keyboard and hides the listbox', async () => {
    const input = renderAutocomplete();
    await waitFor(() => expect(input).toBeEnabled());
    await userEvent.click(input);
    await screen.findByRole('listbox', { name: 'Lista de negócios' });
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(input).toHaveValue('12ABC34501DE35');
    expect(window.sessionStorage.getItem(SELECTED_BUSINESS_STORAGE_KEY)).toBe('12ABC34501DE35');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not select free text and resets it on blur', async () => {
    window.sessionStorage.setItem(SELECTED_BUSINESS_STORAGE_KEY, '61805098000149');
    const input = renderAutocomplete();
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue('61805098000149');

    await userEvent.clear(input);
    await userEvent.type(input, '11222333000181');
    await userEvent.click(screen.getByRole('button', { name: 'Fora' }));

    expect(input).toHaveValue('61805098000149');
    expect(window.sessionStorage.getItem(SELECTED_BUSINESS_STORAGE_KEY)).toBe('61805098000149');
  });

  it('is disabled when there is no business', async () => {
    getBusinessesFn.mockResolvedValue({ ok: true, data: [] });
    const input = renderAutocomplete();
    await waitFor(() => expect(input).toHaveAttribute('placeholder', 'Nenhum negócio disponível'));
    expect(input).toBeDisabled();
  });
});
