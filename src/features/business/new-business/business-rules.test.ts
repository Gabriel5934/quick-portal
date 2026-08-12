import { describe, expect, it } from "vitest";
import { childBusinessType } from "./business-rules";

describe("business signup rules", () => {
  it("creates a re-reseller when a reseller enables the reseller toggle", () => {
    expect(childBusinessType("RESELLER", true)).toBe("RE_RESELLER");
  });

  it("creates a store when a reseller leaves the reseller toggle disabled", () => {
    expect(childBusinessType("RESELLER", false)).toBe("STORE");
  });

  it("only creates stores under a re-reseller", () => {
    expect(childBusinessType("RE_RESELLER", true)).toBe("STORE");
  });
});
