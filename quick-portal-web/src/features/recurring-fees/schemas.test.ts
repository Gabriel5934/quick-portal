import { pricingSchema, scheduleSchema, targetsSchema } from "./schemas";

describe("recurring fee schemas", () => {
  it("requires only the selected pricing branch", () => {
    expect(
      pricingSchema.safeParse({
        pricingMode: "FIXED",
        feeValue: "25.00",
        goalAmount: "",
        valueBelowGoal: "",
        valueAtOrAboveGoal: "",
      }).success,
    ).toBe(true);

    expect(
      pricingSchema.safeParse({
        pricingMode: "GOAL",
        feeValue: "",
        goalAmount: "10000",
        valueBelowGoal: "120",
        valueAtOrAboveGoal: "80",
      }).success,
    ).toBe(true);
  });

  it("validates schedule fields against recurrence", () => {
    expect(
      scheduleSchema.safeParse({
        recurrenceUnit: "WEEK",
        recurrenceInterval: 1,
        chargeRule: "WEEKDAY",
        chargeWeekday: 5,
        startDate: "2026-09-01",
        endDate: "",
      }).success,
    ).toBe(true);
    expect(
      scheduleSchema.safeParse({
        recurrenceUnit: "WEEK",
        recurrenceInterval: 1,
        chargeRule: "DAY_OF_MONTH",
        chargeDay: 10,
        startDate: "2026-09-01",
        endDate: "",
      }).success,
    ).toBe(false);
  });

  it("requires at least one target", () => {
    expect(targetsSchema.safeParse({ targetIds: [] }).success).toBe(false);
    expect(targetsSchema.safeParse({ targetIds: [1] }).success).toBe(true);
  });
});
