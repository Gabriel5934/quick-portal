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

/**
 * Upper bound for the Have I Been Pwned lookup, headers and body included. On
 * timeout the lookup fails and the password is scored locally (fail open).
 */
const PWNED_TIMEOUT_MS = 5000;

/**
 * `fetch` with a timeout signal. The signal also aborts the body read
 * (`response.text()`), so a stalled response cannot hang the lookup.
 * Resolves `fetch` per call so it is never invoked unbound and can be stubbed in tests.
 */
const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(PWNED_TIMEOUT_MS) });

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
  return {
    online: new core.ZxcvbnFactory(options, {
      pwned: pwned.matcherPwnedFactory(fetchWithTimeout),
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
 * Scores a password with zxcvbn locally, without the Have I Been Pwned lookup,
 * so it never touches the network. Meant for live feedback while typing; the
 * breach check runs on submit through `evaluatePassword`. Returns null for an
 * empty password, or when the checkers fail to load.
 */
export async function evaluateLocally(
  password: string,
  email?: string | null
): Promise<PasswordEvaluation | null> {
  if (!password) {
    return null;
  }
  let loaded: Checkers;
  try {
    loaded = await getCheckers();
  } catch {
    return null;
  }
  return toEvaluation(loaded.offline.check(password, emailUserInputs(email)), null);
}

/**
 * Scores a password with zxcvbn and checks it against Have I Been Pwned.
 * Returns null for an empty password, or when the checkers fail to load. A
 * failed pwned lookup never throws: the password is treated as not pwned and
 * the local score is kept.
 */
export async function evaluatePassword(
  password: string,
  email?: string | null
): Promise<PasswordEvaluation | null> {
  if (!password) {
    return null;
  }
  let loaded: Checkers;
  try {
    loaded = await getCheckers();
  } catch {
    // Fail open: without checkers there is no evaluation, so nothing is blocked.
    return null;
  }
  const { online, offline, pwnedWarning } = loaded;
  const userInputs = emailUserInputs(email);
  try {
    return toEvaluation(await online.checkAsync(password, userInputs), pwnedWarning);
  } catch {
    return toEvaluation(offline.check(password, userInputs), null);
  }
}
