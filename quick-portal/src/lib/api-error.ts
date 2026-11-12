/**
 * Error handling shared by the server functions (which talk to Quick API) and
 * the hooks (which surface the message to the user). Messages are pt-BR.
 */

export type ApiFailure = { ok: false; status: number; message: string };
export type ApiSuccess<T> = { ok: true; data: T };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Unwraps a server function result, throwing an ApiError on failure. */
export function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) {
    throw new ApiError(result.message, result.status);
  }
  return result.data;
}

export const NETWORK_ERROR_MESSAGE = 'Não foi possível conectar ao servidor. Tente novamente.';
export const UNEXPECTED_ERROR_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

// Quick API `{message}` bodies (app/cielo/errors.py and routes.py).
const QUICK_API_MESSAGES: Record<string, string> = {
  'Invalid Cielo Credentials': 'Credenciais da Cielo inválidas.',
  'Invalid format from Cielo': 'A Cielo retornou uma resposta em formato inválido.',
  'Cielo did not respond in time': 'A Cielo não respondeu a tempo. Tente novamente.',
  'Could not connect to Cielo': 'Não foi possível conectar à Cielo.',
  'Cielo request failed': 'A requisição para a Cielo falhou.',
  'Seller was onboarded at Cielo but could not be saved':
    'O seller foi cadastrado na Cielo, mas não pôde ser salvo. Contate o suporte.',
};

// Quick API `{detail}` strings (app/auth).
const QUICK_API_DETAILS: Record<string, string> = {
  'Invalid email or password.': 'E-mail ou senha inválidos.',
  'Email address already exists.': 'Já existe uma conta com este e-mail.',
  'Not authenticated': 'Sua sessão expirou. Entre novamente.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** FastAPI 422: `{detail: [{loc: ["body", "address", "zip_code"], msg}]}`. */
function describeValidationDetail(detail: unknown[]): string | null {
  const first = detail.find(isRecord);
  if (!first || typeof first.msg !== 'string') {
    return null;
  }
  const loc = Array.isArray(first.loc) ? first.loc.filter((part) => part !== 'body').join('.') : '';
  return `Dados inválidos${loc ? ` (${loc})` : ''}: ${first.msg}`;
}

/**
 * Cielo errors relayed by Quick API with Cielo's status and body: either the
 * documented ProblemDetails `{title, errors: {field: [msg]}}` or a list of
 * `{Code, Message}` (as cielo-mock returns).
 */
function describeCieloBody(body: unknown): string | null {
  if (Array.isArray(body)) {
    const messages = body
      .filter(isRecord)
      .map((item) => item.Message)
      .filter((message): message is string => typeof message === 'string');
    return messages.length ? `A Cielo recusou o cadastro: ${messages.join(' ')}` : null;
  }
  if (isRecord(body) && isRecord(body.errors)) {
    const messages = Object.entries(body.errors).flatMap(([field, value]) =>
      Array.isArray(value) ? value.map((message) => `${field}: ${String(message)}`) : []
    );
    return messages.length ? `A Cielo recusou o cadastro: ${messages.join(' ')}` : null;
  }
  return null;
}

/** Builds the pt-BR message for a Quick API error response. */
export function describeApiError(status: number, body: unknown): string {
  if (isRecord(body)) {
    if (typeof body.message === 'string') {
      return QUICK_API_MESSAGES[body.message] ?? `Erro da API: ${body.message}`;
    }
    if (typeof body.detail === 'string') {
      return QUICK_API_DETAILS[body.detail] ?? `Erro da API: ${body.detail}`;
    }
    if (Array.isArray(body.detail)) {
      const described = describeValidationDetail(body.detail);
      if (described) {
        return described;
      }
    }
  }
  const cielo = describeCieloBody(body);
  if (cielo) {
    return cielo;
  }
  if (status === 401) {
    return QUICK_API_DETAILS['Not authenticated'];
  }
  if (status >= 500) {
    return 'O servidor encontrou um erro. Tente novamente mais tarde.';
  }
  return UNEXPECTED_ERROR_MESSAGE;
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
