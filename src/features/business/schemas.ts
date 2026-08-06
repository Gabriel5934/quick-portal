import { z } from "zod";

function validateCpf(_cpf: string): boolean {
  return true;
}

function validateCnpj(_cnpj: string): boolean {
  return true;
}

function refineDocument(
  data: {
    documentType: "CNPJ" | "CPF";
    document: string;
    name: string;
    cnaeId?: number;
  },
  ctx: z.RefinementCtx,
) {
  const digits = data.document.replace(/\D/g, "");
  if (data.documentType === "CPF") {
    if (digits.length < 11 || !validateCpf(data.document)) {
      ctx.addIssue({
        code: "custom",
        message: "CPF inválido",
        path: ["document"],
      });
    }
    if (!data.name) {
      ctx.addIssue({
        code: "custom",
        message: "Nome Completo é obrigatório",
        path: ["name"],
      });
    }
    if (!data.cnaeId) {
      ctx.addIssue({
        code: "custom",
        message: "Categoria é obrigatória",
        path: ["cnaeId"],
      });
    }
  } else {
    if (digits.length < 14 || !validateCnpj(data.document)) {
      ctx.addIssue({
        code: "custom",
        message: "CNPJ inválido",
        path: ["document"],
      });
    }
  }
}

const step1BaseSchema = z.object({
  isReseller: z.boolean(),
  documentType: z.enum(["CNPJ", "CPF"]),
  document: z.string(),
  name: z.string(), // used for razao social for cnpjs and full name for cpfs
  nomeFantasia: z.string().optional(),
  cnaeId: z.number().int().positive().optional(),
  email: z.email("Insira um email válido"),
  celular: z
    .string()
    .refine(
      (v) => v.replace(/\D/g, "").length >= 11,
      "Insira um celular válido",
    ),
  telefone: z.string(),
});

export const step1Schema = step1BaseSchema.superRefine(refineDocument);

export const step1Fields = Object.keys(step1BaseSchema.shape) as (keyof z.infer<
  typeof step1BaseSchema
>)[];

export const step2Schema = z.object({
  bankCode: z.string().min(1, "Código do Banco é obrigatório"),
  branch: z
    .string()
    .refine(
      (v) => v.replace(/\D/g, "").length === 4,
      "Agência deve ter 4 dígitos",
    ),
  branchDigit: z
    .string()
    .refine((v) => v.replace(/\D/g, "").length === 1, "Dígito inválido"),
  account: z.string().min(1, "Número da Conta é obrigatório"),
  accountDigit: z
    .string()
    .refine((v) => v.replace(/\D/g, "").length === 1, "Dígito inválido"),
});

export const step2Fields = Object.keys(step2Schema.shape) as (keyof z.infer<
  typeof step2Schema
>)[];

export const step3Schema = z.object({
  postalCode: z
    .string()
    .refine((v) => v.replace(/\D/g, "").length === 8, "CEP inválido"),
  state: z.string().min(1, "Estado é obrigatório"),
  city: z.string().min(1, "Cidade é obrigatória"),
  neighborhood: z.string().min(1, "Bairro é obrigatório"),
  street: z.string().min(1, "Rua é obrigatória"),
  number: z.string().min(1, "Número é obrigatório"),
  complement: z.string().optional(),
});

export const step3Fields = Object.keys(step3Schema.shape) as (keyof z.infer<
  typeof step3Schema
>)[];

const posDeviceItem = z
  .object({
    model: z.string(),
    serialNumber: z.string(),
  })
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

export const step4Schema = z.object({
  posDevices: z.array(posDeviceItem),
});

export const step4Fields = Object.keys(step4Schema.shape) as (keyof z.infer<
  typeof step4Schema
>)[];

export const step5Schema = z.object({
  acquirerId: z
    .number({ message: "Adquirente é obrigatório" })
    .int()
    .positive("Adquirente é obrigatório"),
  planId: z
    .number({ message: "Plano é obrigatório" })
    .int()
    .positive("Plano é obrigatório"),
  expectedRevenue: z.string().min(1, "Receita esperada é obrigatória"),
  commitedRevenue: z.string().min(1, "Receita comprometida é obrigatória"),
  quantityPos: z
    .number({ message: "Quantidade de POS é obrigatória" })
    .int()
    .positive("Quantidade deve ser maior que zero"),
});

export const step5Fields = Object.keys(step5Schema.shape) as (keyof z.infer<
  typeof step5Schema
>)[];

export const newBusinessSchema = step1BaseSchema
  .extend(step2Schema.shape)
  .extend(step3Schema.shape)
  .extend(step4Schema.shape)
  .superRefine(refineDocument);

export const completeBusinessSchema = step2Schema
  .extend(step3Schema.shape)
  .extend(step4Schema.shape)
  .extend(step5Schema.shape);
