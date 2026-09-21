import { describe, expect, it } from "vitest";
import type { OwnFee } from "#hooks/quickApi/useOwnFees";
import { basketFees, buildPlanFees, defaultRows, feeKey } from "./catalog";

function fee(id: number, overrides: Partial<OwnFee> = {}): OwnFee {
  return {
    id,
    basketId: 117,
    value: "2.5000000000",
    baseMdr: "2.0000000000",
    network: "Visa",
    channel: "Physical",
    method: "Installments",
    installment: 2,
    upperInstallment: 6,
    ...overrides,
  };
}

describe("OWN plan fee mapping", () => {
  it("applies a default markup to matching networks while preserving an override", () => {
    const visa = fee(10);
    const elo = fee(11, { network: "Elo" });
    const other = fee(12, { network: null, channel: null, method: "Pix", installment: null, upperInstallment: null });
    const defaults = { [feeKey(visa)]: "1,50" };

    expect(defaultRows([visa, elo, other])).toEqual([visa]);
    expect(buildPlanFees([visa, elo, other], { "11": "0", "12": "2.25" }, defaults)).toEqual({
      entries: [
        { fee: 10, value: "1.50" },
        { fee: 11, value: "0" },
        { fee: 12, value: "2.25" },
      ],
      missing: [],
    });
  });

  it("keeps separate fee IDs for identical non-network products and rejects incomplete rows", () => {
    const posA = fee(20, { network: null, method: "POS Rent", installment: null, upperInstallment: null });
    const posB = fee(21, { network: null, method: "POS Rent", installment: null, upperInstallment: null });
    const anticipation = fee(-117, { method: "Anticipation", network: null });

    expect(basketFees([posA, posB, anticipation], 117)).toEqual([posA, posB]);
    const result = buildPlanFees([posA, posB], { "20": "1.75" }, {});
    expect(result.entries).toEqual([{ fee: 20, value: "1.75" }]);
    expect(result.missing).toHaveLength(1);
  });
});
