import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@test-utils';
import { vi } from 'vite-plus/test';
import type { Business } from '@/api/types';
import { sessionQueryKey } from '@/hooks/auth/session';
import {
  resetSelectedBusiness,
  SELECTED_BUSINESS_STORAGE_KEY,
} from '@/hooks/business/selection-store';
import { businessesQueryKey } from '@/hooks/business/useBusinesses';
import { COPY_FAILED_MESSAGE, IntegrationPage, ROTATE_CONFLICT_MESSAGE } from './IntegrationPage';

const { generateCredentialsFn, rotateCredentialsFn, getBusinessesFn } = vi.hoisted(() => ({
  generateCredentialsFn: vi.fn(),
  rotateCredentialsFn: vi.fn(),
  getBusinessesFn: vi.fn(),
}));

vi.mock('@/server/quick-api', () => ({
  generateCredentialsFn,
  rotateCredentialsFn,
  getBusinessesFn,
  refreshSessionFn: vi.fn(),
}));

const CNPJ = '61805098000149';
const CLIENT_ID = 'qp_test_client_id';
const WITHOUT_CREDENTIALS: Business[] = [{ id: '1', cnpj: CNPJ, client_id: null }];
const WITH_CREDENTIALS: Business[] = [{ id: '1', cnpj: CNPJ, client_id: CLIENT_ID }];
const SECRET = 'fake-test-secret-1';
const ROTATED_SECRET = 'fake-test-secret-2';
const NOT_SHOWN_AGAIN = /não será exibido novamente/;

function newQueryClient(businesses: Business[] = WITHOUT_CREDENTIALS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(sessionQueryKey, {
    accessToken: 'token',
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  queryClient.setQueryData(businessesQueryKey, businesses);
  return queryClient;
}

function renderPage(queryClient = newQueryClient()) {
  const view = render(
    <QueryClientProvider client={queryClient}>
      <IntegrationPage />
    </QueryClientProvider>
  );
  return { ...view, queryClient };
}

/** Everything the browser could keep beyond component state. */
function persistedText(queryClient: QueryClient): string {
  const storage = [window.localStorage, window.sessionStorage].flatMap((store) =>
    Object.keys(store).map((key) => `${key}=${store.getItem(key)}`)
  );
  return JSON.stringify({
    storage,
    url: window.location.href,
    queries: queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.state.data),
    mutations: queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.state.data),
  });
}

beforeEach(() => {
  resetSelectedBusiness();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.sessionStorage.setItem(SELECTED_BUSINESS_STORAGE_KEY, CNPJ);
  generateCredentialsFn.mockReset().mockResolvedValue({
    ok: true,
    data: { status: 'created', credentials: { client_id: CLIENT_ID, client_secret: SECRET } },
  });
  getBusinessesFn.mockReset().mockResolvedValue({ ok: true, data: WITH_CREDENTIALS });
  rotateCredentialsFn.mockReset().mockResolvedValue({
    ok: true,
    data: { client_id: CLIENT_ID, client_secret: ROTATED_SECRET },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IntegrationPage', () => {
  it('offers to generate credentials when the business has none', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Gerar credenciais' })).toBeInTheDocument();
    expect(screen.queryByTestId('client-id')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Rotacionar client secret' })
    ).not.toBeInTheDocument();
  });

  it('shows the secret once after generating and sends the selected business', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Gerar credenciais' }));

    expect(await screen.findByTestId('client-id')).toHaveTextContent(CLIENT_ID);
    expect(screen.getByTestId('client-secret')).toHaveTextContent(SECRET);
    expect(screen.getByText(NOT_SHOWN_AGAIN)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copiar client secret' })).toBeInTheDocument();
    expect(screen.getAllByText(SECRET)).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerar credenciais' })).not.toBeInTheDocument();
    expect(generateCredentialsFn).toHaveBeenCalledTimes(1);
    expect(generateCredentialsFn).toHaveBeenCalledWith({
      data: { accessToken: 'token', businessCnpj: CNPJ },
    });
  });

  it('copies the secret to the clipboard', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Gerar credenciais' }));
    await user.click(await screen.findByRole('button', { name: 'Copiar client secret' }));
    expect(await navigator.clipboard.readText()).toBe(SECRET);
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument();
    expect(screen.queryByText(COPY_FAILED_MESSAGE)).not.toBeInTheDocument();
  });

  it('explains a failed copy and clears the message after a successful one', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Gerar credenciais' }));
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValueOnce(new Error('denied'));

    await user.click(await screen.findByRole('button', { name: 'Copiar client secret' }));
    expect(await screen.findByText(COPY_FAILED_MESSAGE)).toHaveAttribute('role', 'alert');
    expect(screen.getByRole('button', { name: 'Copiar client secret' })).toBeInTheDocument();
    expect(screen.getByTestId('client-secret')).toHaveTextContent(SECRET);

    await user.click(screen.getByRole('button', { name: 'Copiar client secret' }));
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument();
    expect(screen.queryByText(COPY_FAILED_MESSAGE)).not.toBeInTheDocument();
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenLastCalledWith(SECRET);
  });

  it('shows only the existing client_id on load when the business has credentials', async () => {
    renderPage(newQueryClient(WITH_CREDENTIALS));

    expect(await screen.findByTestId('client-id')).toHaveTextContent(CLIENT_ID);
    expect(screen.getByRole('button', { name: 'Rotacionar client secret' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerar credenciais' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('client-secret')).not.toBeInTheDocument();
    expect(screen.queryByText(NOT_SHOWN_AGAIN)).not.toBeInTheDocument();
    expect(generateCredentialsFn).not.toHaveBeenCalled();
  });

  it('shows only the client_id when generating finds existing credentials', async () => {
    generateCredentialsFn.mockResolvedValue({
      ok: true,
      data: { status: 'exists', clientId: CLIENT_ID },
    });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Gerar credenciais' }));

    expect(await screen.findByTestId('client-id')).toHaveTextContent(CLIENT_ID);
    expect(screen.queryByTestId('client-secret')).not.toBeInTheDocument();
    expect(screen.queryByText(NOT_SHOWN_AGAIN)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rotacionar client secret' })).toBeInTheDocument();
  });

  it('asks for confirmation before rotating', async () => {
    renderPage(newQueryClient(WITH_CREDENTIALS));
    await userEvent.click(await screen.findByRole('button', { name: 'Rotacionar client secret' }));

    expect(screen.getByText('Rotacionar o client secret?')).toBeInTheDocument();
    expect(rotateCredentialsFn).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText('Rotacionar o client secret?')).not.toBeInTheDocument();
    expect(rotateCredentialsFn).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Rotacionar client secret' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar rotação' }));

    expect(await screen.findByTestId('client-secret')).toHaveTextContent(ROTATED_SECRET);
    expect(screen.getByText(NOT_SHOWN_AGAIN)).toBeInTheDocument();
    expect(rotateCredentialsFn).toHaveBeenCalledTimes(1);
    expect(rotateCredentialsFn).toHaveBeenCalledWith({
      data: { accessToken: 'token', businessCnpj: CNPJ },
    });
  });

  it('explains a rotation conflict, keeps the client_id and refetches the businesses', async () => {
    rotateCredentialsFn.mockResolvedValue({ ok: false, status: 409, message: 'Conflito' });
    renderPage(newQueryClient(WITH_CREDENTIALS));
    await userEvent.click(await screen.findByRole('button', { name: 'Rotacionar client secret' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar rotação' }));

    expect(await screen.findByText(ROTATE_CONFLICT_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByTestId('client-secret')).not.toBeInTheDocument();
    expect(screen.getByTestId('client-id')).toHaveTextContent(CLIENT_ID);
    expect(screen.getByRole('button', { name: 'Rotacionar client secret' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerar credenciais' })).not.toBeInTheDocument();
    await waitFor(() => expect(getBusinessesFn).toHaveBeenCalledTimes(1));
  });

  it('shows the error message when generating fails', async () => {
    generateCredentialsFn.mockResolvedValue({ ok: false, status: 403, message: 'Sem acesso' });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Gerar credenciais' }));
    expect(await screen.findByText('Sem acesso')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar credenciais' })).toBeInTheDocument();
  });

  it('never stores, caches or puts the secret in the URL, and forgets it on unmount', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { queryClient, unmount } = renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Gerar credenciais' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Rotacionar client secret' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar rotação' }));
    expect(await screen.findByTestId('client-secret')).toHaveTextContent(ROTATED_SECRET);

    for (const secret of [SECRET, ROTATED_SECRET]) {
      expect(persistedText(queryClient)).not.toContain(secret);
      for (const call of setItem.mock.calls) {
        expect(call.join('=')).not.toContain(secret);
      }
    }

    unmount();
    renderPage(queryClient);
    // The refetched business list now carries the client_id, never the secret.
    expect(await screen.findByTestId('client-id')).toHaveTextContent(CLIENT_ID);
    expect(screen.queryByTestId('client-secret')).not.toBeInTheDocument();
    await waitFor(() => expect(queryClient.getMutationCache().getAll()).toHaveLength(0));
  });
});
