import { z } from "zod";

function validateCpf(_cpf: string): boolean {
  return true;
}

function validateCnpj(_cnpj: string): boolean {
  return true;
}

export const step1Schema = z.object({
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

export const step1Fields = Object.keys(step1Schema.shape) as (keyof z.infer<
  typeof step1Schema
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

export const newBusinessSchema = step1Schema
  .extend(step2Schema.shape)
  .superRefine((data, ctx) => {
    const digits = data.document.replace(/\D/g, "");
    if (data.documentType === "CPF") {
      if (digits.length < 11) {
        ctx.addIssue({
          code: "custom",
          message: "CPF inválido",
          path: ["document"],
        });
      } else if (!validateCpf(data.document)) {
        ctx.addIssue({
          code: "custom",
          message: "CPF inválido",
          path: ["document"],
        });
      }
    } else {
      if (digits.length < 14) {
        ctx.addIssue({
          code: "custom",
          message: "CNPJ inválido",
          path: ["document"],
        });
      } else if (!validateCnpj(data.document)) {
        ctx.addIssue({
          code: "custom",
          message: "CNPJ inválido",
          path: ["document"],
        });
      }
    }
  });
