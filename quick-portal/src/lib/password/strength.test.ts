import { createHash } from 'node:crypto';
import { vi } from 'vite-plus/test';
import { z } from 'zod';
import { passwordSchema } from './policy';
import { PWNED_PASSWORD_MESSAGE, withPwnedCheck } from './pwned-check';
import { emailUserInputs, evaluatePassword } from './strength';

const BREACHED = 'correct horse battery staple';
const STRONG = 'vento-lento:cadeira-azul/1987#xq';

/** Fake Have I Been Pwned range API that only knows `BREACHED`. */
function pwnedRangeResponse(url: string) {
  const hash = createHash('sha1').update(BREACHED).digest('hex').toUpperCase();
  const body = url.endsWith(hash.slice(0, 5))
    ? `0000000000000000000000000000000000A:0\r\n${hash.slice(5)}:4213\r\n`
    : '0000000000000000000000000000000000A:0\r\n';
  return new Response(body, { status: 200 });
}

// The pwned matcher always requests a URL string.
const fetchMock = vi.fn((input: string, _init?: RequestInit) =>
  Promise.resolve(pwnedRangeResponse(input))
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('emailUserInputs', () => {
  it('splits the local part on every non-alphanumeric character', () => {
    expect(emailUserInputs('gabriel.andrade@outlook.com.br')).toEqual(['gabriel', 'andrade']);
    expect(emailUserInputs('ana_maria-souza+test@x.com')).toEqual([
      'ana',
      'maria',
      'souza',
      'test',
    ]);
    expect(emailUserInputs('.joão..99@x.com')).toEqual(['joão', '99']);
  });

  it('returns nothing without an e-mail', () => {
    expect(emailUserInputs(undefined)).toEqual([]);
    expect(emailUserInputs('')).toEqual([]);
    expect(emailUserInputs('@x.com')).toEqual([]);
  });
});

describe('evaluatePassword', () => {
  it('does not evaluate an empty password', async () => {
    expect(await evaluatePassword('')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flags a breached password as pwned with the pt-BR warning', async () => {
    const result = await evaluatePassword(BREACHED);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://api.pwnedpasswords.com/range/'),
      expect.anything()
    );
    expect(result).toMatchObject({
      score: 0,
      pwned: true,
      warning: 'Esta senha já foi exposta por uma violação de dados na Internet.',
    });
  });

  it('scores a password missing from the breach list locally', async () => {
    const result = await evaluatePassword(STRONG);
    expect(result?.pwned).toBe(false);
    expect(result?.score).toBeGreaterThanOrEqual(3);
  });

  it('penalizes words from the e-mail and the brand', async () => {
    const password = 'zorbaxquentilplumbo';
    const plain = await evaluatePassword(password);
    const withEmail = await evaluatePassword(password, 'zorbax.quentil_plumbo@x.com');
    expect(withEmail!.score).toBeLessThan(plain!.score);

    const brand = await evaluatePassword('quickcielo');
    const random = await evaluatePassword('xqzvplmtrw');
    expect(brand!.score).toBeLessThan(random!.score);
    expect(brand!.warning).toBe('Senha não deve haver nenhum dado pessoal ou relacionado.');
  });

  it('keeps the local score when the lookup fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const offline = await evaluatePassword(BREACHED);
    expect(offline).toMatchObject({ pwned: false });
    expect(offline?.warning).not.toBe(
      'Esta senha já foi exposta por uma violação de dados na Internet.'
    );
  });

  it('keeps the local score when the lookup response is unreadable', async () => {
    const broken = new Response('');
    vi.spyOn(broken, 'text').mockRejectedValue(new Error('stream error'));
    fetchMock.mockResolvedValueOnce(broken);
    await expect(evaluatePassword(BREACHED)).resolves.toMatchObject({ pwned: false });
  });

  it('keeps the local score when the lookup times out', async () => {
    vi.useFakeTimers();
    // AbortSignal.timeout runs on internal timers that fake timers cannot drive,
    // so route it through the faked setTimeout.
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
    try {
      // A request that only ends when its signal aborts, like a stalled network.
      let markRequested!: () => void;
      const requested = new Promise<void>((resolve) => {
        markRequested = resolve;
      });
      fetchMock.mockImplementationOnce((_input, init) => {
        markRequested();
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        });
      });
      const pending = evaluatePassword(BREACHED);
      await requested;
      expect(timeoutSpy).toHaveBeenCalledWith(5000);
      await vi.advanceTimersByTimeAsync(5000);
      const result = await pending;
      expect(result).not.toBeNull();
      expect(result).toMatchObject({ pwned: false });
    } finally {
      timeoutSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('treats an HTTP error as not pwned', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(evaluatePassword(BREACHED)).resolves.toMatchObject({ pwned: false });
  });

  it('returns no evaluation when the checkers fail to load', async () => {
    vi.resetModules();
    vi.doMock('@zxcvbn-ts/language-pt-br', () => {
      throw new Error('chunk failed to load');
    });
    try {
      const fresh = await import('./strength');
      await expect(fresh.evaluatePassword(BREACHED)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('@zxcvbn-ts/language-pt-br');
      vi.resetModules();
    }
  });
});

describe('withPwnedCheck', () => {
  const schema = z.object({ password: withPwnedCheck(passwordSchema) });

  it('rejects a breached password on the password field', async () => {
    const result = await schema.safeParseAsync({ password: BREACHED });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['password'], message: PWNED_PASSWORD_MESSAGE }),
    ]);
  });

  it('accepts a password that was not breached', async () => {
    await expect(schema.parseAsync({ password: STRONG })).resolves.toEqual({ password: STRONG });
  });

  it('skips the lookup when the policy already fails', async () => {
    const result = await schema.safeParseAsync({ password: 'short' });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'A senha deve ter pelo menos 15 caracteres',
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
