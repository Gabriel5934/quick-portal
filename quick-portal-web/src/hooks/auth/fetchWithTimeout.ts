/** `RequestInit` without `signal`: the timeout owns the request's signal. */
export type TimedRequestInit = Omit<RequestInit, "signal">;

/**
 * Runs `fetch` and aborts it after `timeoutMs`. With `readBody`, the timer
 * also covers reading the body: it is cleared only once `readBody` settles,
 * and the result of `readBody` is returned. Without it, the timer is cleared
 * as soon as the response headers arrive and the `Response` is returned.
 *
 * A timeout rejects with a `DOMException` named "TimeoutError", whether it
 * hits while waiting for the response or while `readBody` reads the body,
 * even when `readBody` catches the read error itself (for example with
 * `res.json().catch(() => null)`). Other errors are rethrown unchanged.
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: TimedRequestInit,
  timeoutMs: number,
): Promise<Response>;
export function fetchWithTimeout<T>(
  input: RequestInfo | URL,
  init: TimedRequestInit,
  timeoutMs: number,
  readBody: (res: Response) => Promise<T>,
): Promise<T>;
export async function fetchWithTimeout<T>(
  input: RequestInfo | URL,
  init: TimedRequestInit,
  timeoutMs: number,
  readBody?: (res: Response) => Promise<T>,
): Promise<T | Response> {
  // An AbortController with a timer instead of `AbortSignal.timeout`, whose
  // timer the test environment's fake timers cannot drive.
  const controller = new AbortController();
  const { signal } = controller;
  const timeout = setTimeout(() => {
    controller.abort(
      new DOMException(
        "The request timed out. Please try again.",
        "TimeoutError",
      ),
    );
  }, timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal });
    const result = readBody ? await readBody(res) : res;
    // `readBody` may have swallowed the abort of its body read.
    signal.throwIfAborted();
    return result;
  } catch (error) {
    // Report a timeout as such, whatever error the aborted step raised.
    signal.throwIfAborted();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
