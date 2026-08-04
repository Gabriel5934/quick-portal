import { z } from "zod";

export const NETWORKS = ["mastercard", "visa", "elo", "pix"] as const;
export type Network = (typeof NETWORKS)[number];

export const CARD_NETWORKS = ["mastercard", "visa", "elo"] as const;
export type CardNetwork = (typeof CARD_NETWORKS)[number];

export const INSTALLMENT_TYPES = Array.from(
  { length: 20 },
  (_, i) => `${i + 2}x`,
);

const feeRowSchema = z.object({
  commission: z.string().min(1, "Obrigatório"),
});

const installmentRowSchema = feeRowSchema
  .extend({
    from: z.number().int().min(2).max(21),
    to: z.number().int().min(2).max(21),
  })
  .refine((range) => range.from <= range.to, {
    message: "A parcela inicial deve ser menor ou igual à final",
    path: ["to"],
  });

const cardNetworkFeesSchema = z.object({
  debit: feeRowSchema,
  credit: feeRowSchema,
  installments: z.array(installmentRowSchema).min(1),
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
  acquirerId: z
    .number({ message: "Adquirente é obrigatório" })
    .int()
    .positive("Adquirente é obrigatório"),
  cnae: z.string().min(1, "CNAE é obrigatório"),
});

export type BasicInfoValues = z.infer<typeof basicInfoSchema>;

export const newPlanSchema = basicInfoSchema.extend({
  fees: feesSchema,
});

export type NewPlanFormValues = z.infer<typeof newPlanSchema>;
export type FeeRowValues = z.infer<typeof feeRowSchema>;
export type InstallmentRowValues = z.infer<typeof installmentRowSchema>;

export function makeBlankRow(): FeeRowValues {
  return { commission: "" };
}

export function makeBlankFees(): NewPlanFormValues["fees"] {
  const cardRows = () => ({
    debit: makeBlankRow(),
    credit: makeBlankRow(),
    installments: INSTALLMENT_TYPES.map((_, index) => ({
      from: index + 2,
      to: index + 2,
      commission: "",
    })),
  });
  return {
    mastercard: cardRows() as NewPlanFormValues["fees"]["mastercard"],
    visa: cardRows() as NewPlanFormValues["fees"]["visa"],
    elo: cardRows() as NewPlanFormValues["fees"]["elo"],
    pix: { pix: makeBlankRow() },
  };
}
