import type { OwnFee } from "#hooks/quickApi/useOwnFees";

export const BASKETS = [
  { id: 117, name: "Cesta por Bandeira" },
  { id: 333, name: "Cesta por Parcela" },
] as const;

export const NETWORKS = ["Visa", "Mastercard", "Elo"] as const;

const METHOD_LABELS: Record<string, string> = {
  Debit: "Débito",
  Credit: "Crédito à vista",
  Installments: "Parcelado",
  Pix: "Pix",
  "POS Rent": "Aluguel de POS",
  "Top Bank": "Top Bank",
  "Visa Voucher": "Visa Voucher",
};

export function basketFees(fees: OwnFee[], basketId: number): OwnFee[] {
  return fees.filter((fee) => fee.basketId === basketId && fee.method !== "Anticipation");
}

export function feeKey(fee: OwnFee): string {
  return [fee.channel ?? "", fee.method, fee.installment ?? "", fee.upperInstallment ?? ""].join("|");
}

export function feeLabel(fee: OwnFee): string {
  const method = METHOD_LABELS[fee.method] ?? fee.method;
  const installments = fee.installment === null
    ? ""
    : fee.upperInstallment === null
      ? ` ${fee.installment}x`
      : ` ${fee.installment}x–${fee.upperInstallment}x`;
  const channel = fee.channel === "Physical" ? "Físico" : fee.channel === "Ecommerce" ? "Ecommerce" : "";
  return [channel, `${method}${installments}`].filter(Boolean).join(" · ");
}

export function feePercent(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : "—";
}

export function defaultRows(fees: OwnFee[]): OwnFee[] {
  const seen = new Set<string>();
  return fees.filter((fee) => {
    if (fee.network === null) return false;
    const key = feeKey(fee);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => feeLabel(left).localeCompare(feeLabel(right), "pt-BR", { numeric: true }));
}

export function buildPlanFees(
  fees: OwnFee[],
  markups: Record<string, string>,
  defaults: Record<string, string>,
): { entries: { fee: number; value: string }[]; missing: string[] } {
  const entries: { fee: number; value: string }[] = [];
  const missing: string[] = [];
  for (const fee of fees) {
    const raw = markups[String(fee.id)]?.trim() ||
      (fee.network ? defaults[feeKey(fee)]?.trim() : undefined) || "";
    const normalized = raw.replace(",", ".");
    if (!/^\d+(?:\.\d{1,10})?$/.test(normalized)) {
      missing.push(`${fee.network ?? "Outros"} · ${feeLabel(fee)}`);
      continue;
    }
    entries.push({ fee: fee.id, value: normalized });
  }
  return { entries, missing };
}
