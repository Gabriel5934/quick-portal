import { z } from "zod";

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

const networkFeesSchema = z.union([
  cardNetworkFeesSchema,
  pixNetworkFeesSchema,
]);

const feesSchema = z.record(z.string(), networkFeesSchema);

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
export type CardNetworkFees = z.infer<typeof cardNetworkFeesSchema>;
export type PixNetworkFees = z.infer<typeof pixNetworkFeesSchema>;

export function makeBlankRow(): FeeRowValues {
  return { commission: "" };
}

export function makeBlankCardFees(): CardNetworkFees {
  return {
    debit: makeBlankRow(),
    credit: makeBlankRow(),
    installments: INSTALLMENT_TYPES.map((_, index) => ({
      from: index + 2,
      to: index + 2,
      commission: "",
    })),
  };
}

export function makeBlankNetworkFees(
  networkCode: string,
): CardNetworkFees | PixNetworkFees {
  return networkCode === "pix" ? { pix: makeBlankRow() } : makeBlankCardFees();
}
