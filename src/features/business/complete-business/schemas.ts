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

const posDeviceItem = z
  .object({ model: z.string(), serialNumber: z.string() })
  .superRefine((device, ctx) => {
    if (device.serialNumber && !device.model) {
      ctx.addIssue({
        code: "custom",
        message: "Modelo é obrigatório quando o serial é informado",
        path: ["model"],
      });
    }
    if (device.model && !device.serialNumber) {
      ctx.addIssue({
        code: "custom",
        message: "Serial é obrigatório quando o modelo é informado",
        path: ["serialNumber"],
      });
    }
  });

export const posDevicesSchema = z.object({
  posDevices: z.array(posDeviceItem),
});
export const posDevicesFields = Object.keys(
  posDevicesSchema.shape,
) as (keyof z.infer<typeof posDevicesSchema>)[];

export const commercialPlanSchema = z.object({
  acquirerId: z
    .number({ message: "Adquirente é obrigatório" })
    .int()
    .positive(),
  planId: z.number({ message: "Plano é obrigatório" }).int().positive(),
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

export const completeBusinessSchema = bankSchema
  .extend(addressSchema.shape)
  .extend(posDevicesSchema.shape)
  .extend(commercialPlanSchema.shape);
