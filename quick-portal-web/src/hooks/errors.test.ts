import { describe, expect, it } from "vitest";
import { firstError } from "./errors";

describe("firstError", () => {
  it("returns a detail message", () => {
    expect(firstError({ detail: "msg" })).toBe("msg");
  });

  it("returns the first message of a field error list", () => {
    expect(firstError({ email: ["bad"] })).toBe("bad");
  });

  it("returns the first message of nested errors", () => {
    expect(
      firstError({ bank_account: { number: [], agency: ["required"] } }),
    ).toBe("required");
  });

  it("returns a plain string body", () => {
    expect(firstError("Server error")).toBe("Server error");
  });

  it.each([null, undefined, 42, {}, []])("returns null for %j", (body) => {
    expect(firstError(body)).toBeNull();
  });
});
