import type {
  CieloCardBrand,
  CieloPaymentMethod,
  CieloPlan,
  CieloPlanCreateRequest,
  CieloPlanFormValues,
} from "./types";

export const CIELO_CARD_BRANDS = [
  "Visa",
  "Elo",
  "Master",
] as const satisfies readonly CieloCardBrand[];

export interface CieloRateRow {
  method: CieloPaymentMethod;
  installments: number | null;
}

/** Every brand has the same rows: debit, then credit from 1x to 12x. */
export const CIELO_RATE_ROWS: readonly CieloRateRow[] = [
  { method: "Debit", installments: null },
  ...Array.from({ length: 12 }, (_, index) => ({
    method: "Credit" as const,
    installments: index + 1,
  })),
];

export const CIELO_METHOD_LABELS: Record<CieloPaymentMethod, string> = {
  Debit: "Débito",
  Credit: "Crédito",
};

export function installmentsLabel(installments: number | null): string {
  return installments === null ? "" : `${installments}x`;
}

export function rateRowLabel(row: CieloRateRow): string {
  return [CIELO_METHOD_LABELS[row.method], installmentsLabel(row.installments)]
    .filter(Boolean)
    .join(" ");
}

function rateRowIndex(row: CieloRateRow): number {
  return CIELO_RATE_ROWS.findIndex(
    (candidate) =>
      candidate.method === row.method &&
      candidate.installments === row.installments,
  );
}

/** Formats an API decimal such as `"1.50"` with the pt-BR separator. */
export function formatDecimal(value: string): string {
  return value.replace(".", ",");
}

export function formatMdr(value: string): string {
  return `${formatDecimal(value)}%`;
}

export function formatFixedFee(value: string): string {
  return `R$ ${formatDecimal(value)}`;
}

export function emptyRates(): CieloPlanFormValues["rates"] {
  const rows = () => CIELO_RATE_ROWS.map(() => ({ mdr: "", fixed_fee: "" }));
  return { Visa: rows(), Elo: rows(), Master: rows() };
}

/** Form values copied from `plan`; the name starts empty because it must be new. */
export function copyPlanValues(plan: CieloPlan): CieloPlanFormValues {
  const rates = emptyRates();
  for (const rate of plan.rates) {
    const index = rateRowIndex(rate);
    if (index >= 0) {
      rates[rate.card_brand][index] = {
        mdr: rate.mdr,
        fixed_fee: rate.fixed_fee,
      };
    }
  }
  return { name: "", description: plan.description, rates };
}

/** Builds the request with rates in brand and row order; see `rateAt`. */
export function cieloPlanRequest(
  values: CieloPlanFormValues,
): CieloPlanCreateRequest {
  return {
    name: values.name,
    description: values.description,
    rates: CIELO_CARD_BRANDS.flatMap((brand) =>
      CIELO_RATE_ROWS.map((row, index) => ({
        card_brand: brand,
        method: row.method,
        installments: row.installments,
        mdr: values.rates[brand][index].mdr,
        fixed_fee: values.rates[brand][index].fixed_fee,
      })),
    ),
  };
}

/** Returns the brand and row of the request rate at `requestIndex`. */
export function rateAt(requestIndex: number): {
  brand: CieloCardBrand;
  row: number;
} {
  return {
    brand: CIELO_CARD_BRANDS[Math.floor(requestIndex / CIELO_RATE_ROWS.length)],
    row: requestIndex % CIELO_RATE_ROWS.length,
  };
}
