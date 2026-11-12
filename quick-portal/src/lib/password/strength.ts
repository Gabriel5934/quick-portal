import type { ZxcvbnFactory, ZxcvbnResult } from '@zxcvbn-ts/core';
import type { PasswordScore } from './strength-labels';

export type PasswordEvaluation = {
  score: PasswordScore;
  warning: string | null;
  suggestions: string[];
  /** True only when the Have I Been Pwned lookup found the password in a breach. */
  pwned: boolean;
};

/** Brand words that should never make a password look stronger. */
const STATIC_USER_INPUTS = ['quick', 'digital', 'bank', 'cielo'];

type Checkers = {
  /** Local matchers plus the pwned lookup. */
  online: ZxcvbnFactory;
  /** Local matchers only, used when the pwned lookup throws. */
  offline: ZxcvbnFactory;
  pwnedWarning: string;
};

let checkers: Promise<Checkers> | null = null;

async function createCheckers(): Promise<Checkers> {
  const [core, common, en, ptBr, pwned] = await Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-en'),
    import('@zxcvbn-ts/language-pt-br'),
    import('@zxcvbn-ts/matcher-pwned'),
  ]);
  const options = {
    translations: ptBr.translations,
    graphs: { qwerty: common.adjacencyGraphs.qwerty },
    dictionary: {
      ...common.dictionary,
      ...en.dictionary,
      ...ptBr.dictionary,
      userInputs: STATIC_USER_INPUTS,
    },
  };
  // Resolve `fetch` per call so it is never invoked unbound and can be stubbed in tests.
  const universalFetch: typeof fetch = (input, init) => fetch(input, init);
  return {
    online: new core.ZxcvbnFactory(options, {
      pwned: pwned.matcherPwnedFactory(universalFetch),
    }),
    offline: new core.ZxcvbnFactory(options),
    pwnedWarning: ptBr.translations.warnings.pwned,
  };
}

/** Shared checkers, built once on first use; retried if loading failed. */
function getCheckers(): Promise<Checkers> {
  checkers ??= createCheckers().catch((error: unknown) => {
    checkers = null;
    throw error;
  });
  return checkers;
}

/**
 * Words from the e-mail's local part, split on every non-alphanumeric character.
 * `gabriel.andrade@outlook.com.br` gives `['gabriel', 'andrade']`.
 */
export function emailUserInputs(email: string | null | undefined): string[] {
  if (!email) {
    return [];
  }
  const at = email.indexOf('@');
  const localPart = at === -1 ? email : email.slice(0, at);
  return localPart.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function toEvaluation(result: ZxcvbnResult, pwnedWarning: string | null): PasswordEvaluation {
  const pwned =
    pwnedWarning !== null &&
    (result.sequence.some((match) => match.pattern === 'pwned') ||
      result.feedback.warning === pwnedWarning);
  return {
    score: result.score,
    warning: result.feedback.warning || null,
    suggestions: result.feedback.suggestions,
    pwned,
  };
}

/**
 * Scores a password with zxcvbn and checks it against Have I Been Pwned.
 * Returns null for an empty password. A failed pwned lookup never throws: the
 * password is treated as not pwned and the local score is kept.
 */
export async function evaluatePassword(
  password: string,
  email?: string | null
): Promise<PasswordEvaluation | null> {
  if (!password) {
    return null;
  }
  const { online, offline, pwnedWarning } = await getCheckers();
  const userInputs = emailUserInputs(email);
  try {
    return toEvaluation(await online.checkAsync(password, userInputs), pwnedWarning);
  } catch {
    return toEvaluation(offline.check(password, userInputs), null);
  }
}
