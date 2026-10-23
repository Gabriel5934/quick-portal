import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./fetchWithTimeout";

const fetchMock = vi.fn<typeof fetch>();

const TIMEOUT_MS = 1_000;
const ENDPOINT = "http://api.test/endpoint/";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** A response that never comes; rejects with the reason when aborted. */
function neverAnswers(init?: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(init.signal?.reason as Error),
    );
  });
}

/** Headers arrive, the body never ends; the read fails when aborted. */
function stalledBody(signal: AbortSignal) {
  return new Response(
    new ReadableStream({
      start(controller) {
        signal.addEventListener("abort", () =>
          controller.error(signal.reason),
        );
      },
    }),
    { status: 200 },
  );
}

function lastSignal() {
  return fetchMock.mock.lastCall![1]!.signal!;
}

/** Settles `promise` into a value or an error, without unhandled rejections. */
function outcome<T>(promise: Promise<T>) {
  const state: { settled: boolean; value?: T; error?: unknown } = {
    settled: false,
  };
  promise.then(
    (value) => Object.assign(state, { settled: true, value }),
    (error: unknown) => Object.assign(state, { settled: true, error }),
  );
  return state;
}

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns the response, passes the request through and clears its timer", async () => {
    const response = new Response(null, { status: 204 });
    fetchMock.mockResolvedValue(response);

    await expect(
      fetchWithTimeout(
        ENDPOINT,
        { method: "POST", credentials: "include", keepalive: true },
        TIMEOUT_MS,
      ),
    ).resolves.toBe(response);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      keepalive: true,
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 2);
    expect(lastSignal().aborted).toBe(false);
  });

  it("returns a non-2xx response without throwing and clears its timer", async () => {
    const response = new Response(null, { status: 500 });
    fetchMock.mockResolvedValue(response);

    await expect(fetchWithTimeout(ENDPOINT, {}, TIMEOUT_MS)).resolves.toBe(response);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the timer until the body is read and returns what readBody returns", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: 1 }), { status: 200 }),
    );
    const body = deferred<void>();

    const result = outcome(
      fetchWithTimeout(ENDPOINT, {}, TIMEOUT_MS, async (res) => {
        await body.promise;
        return (await res.json()) as unknown;
      }),
    );
    await vi.advanceTimersByTimeAsync(0);

    // The response arrived, but the body is still being read.
    expect(result.settled).toBe(false);
    expect(vi.getTimerCount()).toBe(1);

    body.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toEqual({ settled: true, value: { ok: 1 } });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rethrows a body read error unchanged and clears its timer", async () => {
    fetchMock.mockResolvedValue(new Response("not json", { status: 200 }));

    await expect(
      fetchWithTimeout(ENDPOINT, {}, TIMEOUT_MS, (res) => res.json()),
    ).rejects.toBeInstanceOf(SyntaxError);
    expect(vi.getTimerCount()).toBe(0);
    expect(lastSignal().aborted).toBe(false);
  });

  it("rethrows a network error unchanged and clears its timer", async () => {
    const error = new TypeError("Failed to fetch");
    fetchMock.mockRejectedValue(error);

    await expect(fetchWithTimeout(ENDPOINT, {}, TIMEOUT_MS)).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a request whose response never arrives with a TimeoutError", async () => {
    fetchMock.mockImplementation((_url, init) => neverAnswers(init));

    const result = outcome(fetchWithTimeout(ENDPOINT, {}, TIMEOUT_MS));
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(result.settled).toBe(false);
    expect(lastSignal().aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(result.settled).toBe(true);
    expect(result.error).toBeInstanceOf(DOMException);
    expect(result.error).toMatchObject({ name: "TimeoutError" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a body read that never finishes, even when readBody catches it", async () => {
    fetchMock.mockImplementation((_url, init) =>
      Promise.resolve(stalledBody(init!.signal!)),
    );

    const result = outcome(
      fetchWithTimeout(ENDPOINT, {}, TIMEOUT_MS, (res) =>
        res.json().catch(() => null),
      ),
    );
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(result.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(result.settled).toBe(true);
    expect(result.error).toMatchObject({ name: "TimeoutError" });
    expect(vi.getTimerCount()).toBe(0);
  });
});
