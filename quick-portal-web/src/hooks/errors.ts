/**
 * The first string in an error response body, searched depth-first in
 * `Object.values` order: `{ detail: "..." }`, DRF's `{ field: ["..."] }` and
 * nested serializer errors all yield their first message. `null` when the body
 * holds no string (including a non-JSON body read as `null`).
 */
export function firstError(body: unknown): string | null {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return null;
  for (const value of Object.values(body)) {
    const message = firstError(value);
    if (message) return message;
  }
  return null;
}
