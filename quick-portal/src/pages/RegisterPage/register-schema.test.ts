import { vi } from 'vite-plus/test';
import { PWNED_PASSWORD_MESSAGE } from '@/lib/password/pwned-check';
import { evaluatePassword } from '@/lib/password/strength';
import { createRegisterSchema, TURNSTILE_REQUIRED_MESSAGE } from './register-schema';

vi.mock('@/lib/password/strength', () => ({ evaluatePassword: vi.fn() }));

const evaluate = vi.mocked(evaluatePassword);
const PASSWORD = 'vento-lento:cadeira-azul/1987#xq';
const TOKEN = 'turnstile-token';

const messages = async (values: { email: string; password: string; turnstile_token?: string }) => {
  const result = await createRegisterSchema().safeParseAsync({ turnstile_token: TOKEN, ...values });
  return result.success
    ? []
    : result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
};

beforeEach(() => {
  evaluate.mockReset();
  evaluate.mockResolvedValue({ score: 4, warning: null, suggestions: [], pwned: false });
});

describe('createRegisterSchema', () => {
  it('accepts a valid e-mail and password, trimming the e-mail', async () => {
    await expect(
      createRegisterSchema().parseAsync({
        email: '  ana@empresa.com.br ',
        password: PASSWORD,
        turnstile_token: TOKEN,
      })
    ).resolves.toEqual({ email: 'ana@empresa.com.br', password: PASSWORD, turnstile_token: TOKEN });
  });

  it('rejects an invalid or missing e-mail', async () => {
    expect(await messages({ email: 'ana@', password: PASSWORD })).toEqual([
      { path: ['email'], message: 'E-mail inválido' },
    ]);
    expect(await messages({ email: '   ', password: PASSWORD })).toEqual([
      { path: ['email'], message: 'Informe o e-mail' },
    ]);
  });

  it('requires a Turnstile token', async () => {
    expect(
      await messages({ email: 'ana@empresa.com.br', password: PASSWORD, turnstile_token: '' })
    ).toEqual([{ path: ['turnstile_token'], message: TURNSTILE_REQUIRED_MESSAGE }]);
  });

  it('rejects a 14-character password without the pwned lookup', async () => {
    expect(await messages({ email: 'ana@empresa.com.br', password: 'a'.repeat(14) })).toEqual([
      { path: ['password'], message: 'A senha deve ter pelo menos 15 caracteres' },
    ]);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('reports a pwned password on the password field', async () => {
    evaluate.mockResolvedValue({ score: 0, warning: null, suggestions: [], pwned: true });
    expect(await messages({ email: 'ana@empresa.com.br', password: PASSWORD })).toEqual([
      { path: ['password'], message: PWNED_PASSWORD_MESSAGE },
    ]);
    expect(PWNED_PASSWORD_MESSAGE).toBe('Essa senha foi encontrada em um vazamento de dados');
  });
});
