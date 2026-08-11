import { createStore, type GlobalState } from "little-state-machine";

export type PricingMode = "FIXED" | "GOAL";
export type RecurrenceUnit = "DAY" | "WEEK" | "MONTH" | "YEAR";
export type ChargeRule =
  | "INTERVAL"
  | "WEEKDAY"
  | "DAY_OF_MONTH"
  | "BUSINESS_DAY_OF_MONTH"
  | "DATE_OF_YEAR";

export interface RecurringFeeDraft {
  ownerId: number | null;
  name: string;
  description: string;
  setupValue: string;
  active: boolean;
  pricingMode: PricingMode;
  feeValue: string;
  goalAmount: string;
  valueBelowGoal: string;
  valueAtOrAboveGoal: string;
  recurrenceUnit: RecurrenceUnit;
  recurrenceInterval: number;
  chargeRule: ChargeRule;
  chargeWeekday?: number;
  chargeDay?: number;
  chargeMonth?: number;
  businessDayOrdinal?: number;
  startDate: string;
  endDate: string;
  targetIds: number[];
}

export const initialRecurringFeeDraft: RecurringFeeDraft = {
  ownerId: null,
  name: "",
  description: "",
  setupValue: "0.00",
  active: true,
  pricingMode: "FIXED",
  feeValue: "",
  goalAmount: "",
  valueBelowGoal: "",
  valueAtOrAboveGoal: "",
  recurrenceUnit: "MONTH",
  recurrenceInterval: 1,
  chargeRule: "DAY_OF_MONTH",
  chargeDay: 1,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  targetIds: [],
};

declare module "little-state-machine" {
  interface GlobalState {
    recurringFeeDraft: RecurringFeeDraft;
  }
}

createStore(
  { recurringFeeDraft: initialRecurringFeeDraft },
  { name: "quick-recurring-fee-wizard", persist: "none" },
);

export function updateRecurringFeeDraft(
  state: GlobalState,
  payload: Partial<RecurringFeeDraft>,
): GlobalState {
  return {
    ...state,
    recurringFeeDraft: { ...state.recurringFeeDraft, ...payload },
  };
}

export function resetRecurringFeeDraft(state: GlobalState): GlobalState {
  return { ...state, recurringFeeDraft: { ...initialRecurringFeeDraft } };
}
