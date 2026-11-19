import { fireEvent, render, screen } from '@test-utils';
import { renderToString } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { theme } from '@/theme';
import { LoginPage } from './LoginPage';

const mutate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

vi.mock('@/hooks/auth/useLogin', () => ({
  useLogin: () => ({ mutate, error: null, isPending: false }),
}));

/** Parses the server-rendered markup, i.e. the form a browser submits before hydration. */
function serverRenderedForm() {
  const html = renderToString(
    <MantineProvider theme={theme} env="test">
      <LoginPage />
    </MantineProvider>
  );
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const form = doc.querySelector('form');
  if (!form) {
    throw new Error('login form not rendered');
  }
  return form;
}

describe('LoginPage', () => {
  beforeEach(() => mutate.mockClear());

  it('server-renders the form as a POST to a fixed action', () => {
    const form = serverRenderedForm();
    expect(form.getAttribute('method')).toBe('post');
    expect(form.method).toBe('post');
    expect(form.getAttribute('action')).toBe('/');
  });

  it('keeps credentials out of the URL a pre-hydration native submit would target', () => {
    const form = serverRenderedForm();
    const email = form.querySelector<HTMLInputElement>('input[name="email"]');
    const password = form.querySelector<HTMLInputElement>('input[name="password"]');
    if (!email || !password) {
      throw new Error('credential inputs not rendered');
    }
    email.value = 'user@example.com';
    password.value = 'not-a-real-password';

    // A native submission only encodes fields into the URL for GET (HTML spec "mutate action URL");
    // POST sends them in the body, so the target URL is the bare action.
    const action = new URL(form.action, 'http://localhost/');
    expect(form.method).not.toBe('get');
    expect(action.search).toBe('');
    expect(action.href).not.toContain('user%40example.com');
    expect(action.href).not.toContain('not-a-real-password');
  });

  it('handles the submit in JS after hydration instead of a native submission', () => {
    render(<LoginPage />);
    const form = screen.getByRole('button', { name: 'Entrar' }).closest('form');
    if (!form) {
      throw new Error('login form not rendered');
    }
    // fireEvent returns false when a handler called preventDefault().
    expect(fireEvent.submit(form)).toBe(false);
  });
});
