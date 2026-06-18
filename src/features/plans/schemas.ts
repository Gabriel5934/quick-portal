import { z } from "zod";

export const NETWORKS = ["mastercard", "visa", "elo", "pix"] as const;
export type Network = (typeof NETWORKS)[number];

export const CARD_NETWORKS = ["mastercard", "visa", "elo"] as const;
export type CardNetwork = (typeof CARD_NETWORKS)[number];

export const INSTALLMENT_TYPES = Array.from(
  { length: 20 },
  (_, i) => `${i + 2}x`,
);

export function installmentLevel(
  paymentType: string,
): "installmentsA" | "installmentsB" | "installmentsC" | "installmentsD" {
  const n = parseInt(paymentType, 10);
  if (n <= 6) return "installmentsA";
  if (n <= 11) return "installmentsB";
  if (n <= 16) return "installmentsC";
  return "installmentsD";
}

const feeRowSchema = z.object({
  commission: z.string().min(1, "Obrigatório"),
});

const cardNetworkFeesSchema = z.object({
  debit: feeRowSchema,
  credit: feeRowSchema,
  ...Object.fromEntries(INSTALLMENT_TYPES.map((t) => [t, feeRowSchema])),
});

const pixNetworkFeesSchema = z.object({
  pix: feeRowSchema,
});

const feesSchema = z.object({
  mastercard: cardNetworkFeesSchema,
  visa: cardNetworkFeesSchema,
  elo: cardNetworkFeesSchema,
  pix: pixNetworkFeesSchema,
});

export const basicInfoSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string(),
  split: z.boolean(),
  anticipation: z.boolean(),
  anticipation_fee: z.string(),
  mccId: z
    .number({ message: "MCC é obrigatório" })
    .int()
    .positive("MCC é obrigatório"),
});

export type BasicInfoValues = z.infer<typeof basicInfoSchema>;

export const newPlanSchema = basicInfoSchema.extend({
  fees: feesSchema,
});

export type NewPlanFormValues = z.infer<typeof newPlanSchema>;
export type FeeRowValues = z.infer<typeof feeRowSchema>;

export function makeBlankRow(): FeeRowValues {
  return { commission: "" };
}

export function makeBlankFees(): NewPlanFormValues["fees"] {
  const cardRows = () => ({
    debit: makeBlankRow(),
    credit: makeBlankRow(),
    ...Object.fromEntries(INSTALLMENT_TYPES.map((t) => [t, makeBlankRow()])),
  });
  return {
    mastercard: cardRows() as NewPlanFormValues["fees"]["mastercard"],
    visa: cardRows() as NewPlanFormValues["fees"]["visa"],
    elo: cardRows() as NewPlanFormValues["fees"]["elo"],
    pix: { pix: makeBlankRow() },
  };
}
