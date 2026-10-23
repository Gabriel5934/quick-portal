import { vi } from "vitest";

/**
 * Exclusive, FIFO Web Lock stand-in (jsdom has no navigator.locks). Like the
 * real API, it is not reentrant: requesting the lock while holding it waits
 * forever. Remove it with `Reflect.deleteProperty(navigator, "locks")`.
 */
export function installLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  const request = vi.fn((_name: string, callback: () => Promise<unknown>) => {
    const run = tail.then(() => callback());
    tail = run.catch(() => undefined);
    return run;
  });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request },
  });
  return request;
}
