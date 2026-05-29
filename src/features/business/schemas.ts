import { z } from "zod";

function validateCpf(_cpf: string): boolean {
  return true;
}

function validateCnpj(_cnpj: string): boolean {
  return true;
}

function refineDocument(
  data: { documentType: "CNPJ" | "CPF"; document: string },
  ctx: z.RefinementCtx,
) {
  const digits = data.document.replace(/\D/g, "");
  if (data.documentType === "CPF") {
    if (digits.length < 11 || !validateCpf(data.document)) {
      ctx.addIssue({ code: "custom", message: "CPF inválido", path: ["document"] });
    }
  } else {
    if (digits.length < 14 || !validateCnpj(data.document)) {
      ctx.addIssue({ code: "custom", message: "CNPJ inválido", path: ["document"] });
    }
  }
}

const step1BaseSchema = z.object({
  documentType: z.enum(["CNPJ", "CPF"]),
  document: z.string(),
  razaoSocial: z.string().min(1, "Nome / Razão Social é obrigatório"),
  nomeFantasia: z.string().min(1, "Nome Fantasia é obrigatório"),
  mcc: z.string().min(1, "MCC é obrigatório"),
  email: z.string().email("Insira um email válido"),
  celular: z
    .string()
    .refine(
      (v) => v.replace(/\D/g, "").length >= 11,
      "Insira um celular válido",
    ),
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
});

export const step3Fields = Object.keys(step3Schema.shape) as (keyof z.infer<
  typeof step3Schema
>)[];

const posDeviceItem = z.object({
  model: z.string().min(1, "Modelo é obrigatório"),
  serialNumber: z.string().min(1, "Serial é obrigatório"),
});

export const step4Schema = z.object({
  posDevices: z
    .array(z.object({ model: z.string(), serialNumber: z.string() }))
    .transform((devices) => {
      const filled = devices.filter((d) => d.model !== "" || d.serialNumber !== "");
      return filled.length > 0 ? filled : devices.slice(0, 1);
    })
    .pipe(
      z.array(posDeviceItem).min(1, "Adicione pelo menos um dispositivo"),
    ),
});

export const step4Fields = Object.keys(step4Schema.shape) as (keyof z.infer<
  typeof step4Schema
>)[];

export const newBusinessSchema = step1BaseSchema
  .extend(step2Schema.shape)
  .extend(step3Schema.shape)
  .extend(step4Schema.shape)
  .superRefine(refineDocument);
