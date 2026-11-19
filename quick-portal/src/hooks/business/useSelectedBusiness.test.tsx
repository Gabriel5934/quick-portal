import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@test-utils';
import { renderToString } from 'react-dom/server';
import { vi } from 'vite-plus/test';
import type { Business } from '@/api/types';
import { sessionQueryKey } from '@/hooks/auth/session';
import { resetSelectedBusiness, SELECTED_BUSINESS_STORAGE_KEY } from './selection-store';
import { useSelectedBusiness } from './useSelectedBusiness';

const { getBusinessesFn } = vi.hoisted(() => ({ getBusinessesFn: vi.fn() }));

vi.mock('@/server/quick-api', () => ({ getBusinessesFn, refreshSessionFn: vi.fn() }));

const BUSINESSES: Business[] = [
  { id: '1', cnpj: '61805098000149' },
  { id: '2', cnpj: '12abc34501de35' },
];

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(sessionQueryKey, {
    accessToken: 'token',
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  resetSelectedBusiness();
  window.sessionStorage.clear();
  getBusinessesFn.mockReset().mockResolvedValue({ ok: true, data: BUSINESSES });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSelectedBusiness', () => {
  it('is unknown on the server and before mount, then resolves', () => {
    const Wrapper = createWrapper();
    function Probe() {
      return <>{useSelectedBusiness().status}</>;
    }
    expect(
      renderToString(
        <Wrapper>
          <Probe />
        </Wrapper>
      )
    ).toBe('unknown');

    const statuses: string[] = [];
    renderHook(
      () => {
        const selection = useSelectedBusiness();
        statuses.push(selection.status);
        return selection;
      },
      { wrapper: Wrapper }
    );
    expect(statuses[0]).toBe('unknown');
    expect(statuses.at(-1)).toBe('none');
  });

  it('reads a valid stored value', async () => {
    window.sessionStorage.setItem(SELECTED_BUSINESS_STORAGE_KEY, '12abc34501de35');
    const { result } = renderHook(() => useSelectedBusiness(), { wrapper: createWrapper() });
    expect(result.current).toMatchObject({ status: 'selected', cnpj: '12ABC34501DE35' });
    // Still selected once the list (which contains it) is loaded.
    await waitFor(() => expect(getBusinessesFn).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.status).toBe('selected');
  });

  it('ignores and removes an invalid stored value', () => {
    window.sessionStorage.setItem(SELECTED_BUSINESS_STORAGE_KEY, '61.805.098/0001-49');
    const { result } = renderHook(() => useSelectedBusiness(), { wrapper: createWrapper() });
    expect(result.current.status).toBe('none');
    expect(window.sessionStorage.getItem(SELECTED_BUSINESS_STORAGE_KEY)).toBeNull();
  });

  it('survives a sessionStorage that throws', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { result } = renderHook(() => useSelectedBusiness(), { wrapper: createWrapper() });
    expect(result.current.status).toBe('none');

    act(() => {
      result.current.select('61805098000149');
    });
    expect(result.current).toMatchObject({ status: 'selected', cnpj: '61805098000149' });

    act(() => {
      result.current.clear();
    });
    expect(result.current.status).toBe('none');
  });

  it('stores a selection and clear removes the key', () => {
    const { result } = renderHook(() => useSelectedBusiness(), { wrapper: createWrapper() });
    act(() => {
      expect(result.current.select('61.805.098/0001-49')).toBe(true);
    });
    expect(window.sessionStorage.getItem(SELECTED_BUSINESS_STORAGE_KEY)).toBe('61805098000149');

    act(() => {
      result.current.clear();
    });
    expect(result.current.status).toBe('none');
    expect(window.sessionStorage.getItem(SELECTED_BUSINESS_STORAGE_KEY)).toBeNull();
  });

  it('clears a stale selection that is not in the list', async () => {
    window.sessionStorage.setItem(SELECTED_BUSINESS_STORAGE_KEY, '11222333000181');
    const { result } = renderHook(() => useSelectedBusiness(), { wrapper: createWrapper() });
    expect(result.current.status).toBe('selected');

    await waitFor(() => expect(result.current.status).toBe('none'));
    expect(window.sessionStorage.getItem(SELECTED_BUSINESS_STORAGE_KEY)).toBeNull();
  });
});
