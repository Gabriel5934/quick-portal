import { createRef } from 'react';
import { act, render, screen, userEvent, waitFor } from '@test-utils';
import { vi } from 'vite-plus/test';
import {
  Turnstile,
  TURNSTILE_SCRIPT_URL,
  TURNSTILE_SITE_KEY,
  type TurnstileHandle,
} from './Turnstile';

const api = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };

beforeEach(() => {
  api.render.mockReset().mockReturnValue('widget-1');
  api.reset.mockReset();
  api.remove.mockReset();
  window.turnstile = api;
});

afterEach(() => {
  delete window.turnstile;
  document.head.querySelectorAll('script').forEach((script) => script.remove());
});

const injectedScripts = () =>
  document.head.querySelectorAll<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_URL}"]`);

describe('Turnstile', () => {
  it('renders the widget and reports, resets and removes it', async () => {
    const onToken = vi.fn();
    const ref = createRef<TurnstileHandle>();
    const { unmount } = render(<Turnstile ref={ref} action="register" onToken={onToken} />);

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    const [container, options] = api.render.mock.calls[0];
    expect(container).toBe(screen.getByTestId('turnstile'));
    expect(options).toMatchObject({ sitekey: TURNSTILE_SITE_KEY, action: 'register' });

    act(() => {
      options.callback('token-1');
    });
    expect(onToken).toHaveBeenLastCalledWith('token-1');
    act(() => {
      options['expired-callback']();
    });
    expect(onToken).toHaveBeenLastCalledWith('');

    ref.current?.reset();
    expect(api.reset).toHaveBeenCalledWith('widget-1');

    unmount();
    expect(api.remove).toHaveBeenCalledWith('widget-1');
  });

  it('offers a retry when the script fails to load', async () => {
    delete window.turnstile;
    render(<Turnstile action="register" onToken={vi.fn()} />);

    await waitFor(() => expect(injectedScripts()).toHaveLength(1));
    const failed = injectedScripts()[0];
    act(() => {
      failed.dispatchEvent(new Event('error'));
    });

    expect(await screen.findByText('Não foi possível carregar a verificação.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(failed.isConnected).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(injectedScripts()).toHaveLength(1));
    const fresh = injectedScripts()[0];
    expect(fresh).not.toBe(failed);
    expect(screen.queryByText('Não foi possível carregar a verificação.')).not.toBeInTheDocument();

    window.turnstile = api;
    act(() => {
      fresh.dispatchEvent(new Event('load'));
    });

    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(api.render.mock.calls[0][0]).toBe(screen.getByTestId('turnstile'));
  });

  it('shows the validation error', () => {
    render(<Turnstile action="register" onToken={vi.fn()} error="Confirme" />);
    expect(screen.getByText('Confirme')).toBeInTheDocument();
  });
});
