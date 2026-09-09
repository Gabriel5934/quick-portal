import type { BusinessType } from "#hooks/quickApi/useBusinesses";

export function childBusinessType(
  parentType: BusinessType,
  createReseller: boolean,
): "RE_RESELLER" | "STORE" {
  return parentType === "RESELLER" && createReseller ? "RE_RESELLER" : "STORE";
}
