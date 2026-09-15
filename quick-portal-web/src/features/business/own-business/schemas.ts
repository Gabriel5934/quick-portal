import { z } from "zod";

export const bankSchema = z.object({
  bankCode: z.string().min(1, "Código do Banco é obrigatório"),
  branch: z
    .string()
    .refine(
      (value) => value.replace(/\D/g, "").length === 4,
      "Agência deve ter 4 dígitos",
    ),
  branchDigit: z
    .string()
    .refine(
      (value) => value.replace(/\D/g, "").length === 1,
      "Dígito inválido",
    ),
  account: z.string().min(1, "Número da Conta é obrigatório"),
  accountDigit: z
    .string()
    .refine(
      (value) => value.replace(/\D/g, "").length === 1,
      "Dígito inválido",
    ),
});

export const bankFields = Object.keys(bankSchema.shape) as (keyof z.infer<
  typeof bankSchema
>)[];

export const addressSchema = z.object({
  postalCode: z
    .string()
    .refine((value) => value.replace(/\D/g, "").length === 8, "CEP inválido"),
  state: z.string().min(1, "Estado é obrigatório"),
  city: z.string().min(1, "Cidade é obrigatória"),
  neighborhood: z.string().min(1, "Bairro é obrigatório"),
  street: z.string().min(1, "Rua é obrigatória"),
  number: z.string().min(1, "Número é obrigatório"),
  complement: z.string().optional(),
});

export const addressFields = Object.keys(addressSchema.shape) as (keyof z.infer<
  typeof addressSchema
>)[];

export const commercialPlanSchema = z.object({
  planId: z.number({ message: "Plano é obrigatório" }).int().positive(),
  activityId: z
    .number({ message: "Atividade do plano é obrigatória" })
    .int()
    .positive(),
  signatoryName: z.string().min(1, "Nome do responsável é obrigatório"),
  signatoryCpf: z
    .string()
    .refine((value) => value.replace(/\D/g, "").length === 11, "CPF inválido"),
  signatoryEmail: z.email("E-mail inválido"),
  expectedRevenue: z.string().min(1, "Receita esperada é obrigatória"),
  commitedRevenue: z.string().min(1, "Receita comprometida é obrigatória"),
  quantityPos: z
    .number({ message: "Quantidade de POS é obrigatória" })
    .int()
    .positive("Quantidade deve ser maior que zero"),
});

export const commercialPlanFields = Object.keys(
  commercialPlanSchema.shape,
) as (keyof z.infer<typeof commercialPlanSchema>)[];

export const ownBusinessSchema = bankSchema
  .extend(addressSchema.shape)
  .extend(commercialPlanSchema.shape);
