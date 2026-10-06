import { z } from "zod";

// Rates stay strings, with "." as the decimal separator, to avoid float
// rounding. The inputs display them with the pt-BR comma.
const rateValueSchema = z.object({
  mdr: z
    .string()
    .min(1, "Informe o MDR")
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "MDR inválido")
    .refine((value) => Number(value) <= 100, "O MDR deve ser de no máximo 100%"),
  fixed_fee: z
    .string()
    .min(1, "Informe a taxa fixa")
    .regex(/^\d{1,8}(\.\d{1,2})?$/, "Taxa fixa inválida"),
});

const brandRatesSchema = z.array(rateValueSchema).length(13);

export const cieloPlanFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome do plano")
    .max(200, "O nome deve ter no máximo 200 caracteres"),
  description: z.string(),
  rates: z.object({
    Visa: brandRatesSchema,
    Elo: brandRatesSchema,
    Master: brandRatesSchema,
  }),
});

export type CieloPlanFormValues = z.infer<typeof cieloPlanFormSchema>;
