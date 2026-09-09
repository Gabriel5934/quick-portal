import type { GlobalState } from "little-state-machine";
import { initialRecurringFeeDraft, resetRecurringFeeDraft } from "./form-store";

describe("recurring fee form store", () => {
  it("clears the draft while preserving its business scope", () => {
    const state: GlobalState = {
      recurringFeeDraft: {
        ...initialRecurringFeeDraft,
        ownerId: 42,
        name: "Monthly fee",
        targetIds: [7],
      },
    };

    expect(resetRecurringFeeDraft(state).recurringFeeDraft).toEqual({
      ...initialRecurringFeeDraft,
      ownerId: 42,
    });
  });
});
