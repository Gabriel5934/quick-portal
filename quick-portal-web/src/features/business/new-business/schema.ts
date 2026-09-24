import { z } from "zod";
import { isValidCnpj, isValidCpf, normalizeDocument } from "../document";

function refineDocument(
  data: {
    documentType: "CNPJ" | "CPF";
    document: string;
    name: string;
  },
  ctx: z.RefinementCtx,
) {
  const canonical = normalizeDocument(data.document, data.documentType);
  if (data.documentType === "CPF") {
    if (!isValidCpf(canonical)) {
      ctx.addIssue({
        code: "custom",
        message: "CPF inválido",
        path: ["document"],
      });
    }
    if (!data.name.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Nome Completo é obrigatório",
        path: ["name"],
      });
    }
    if (data.name.length > 50) {
      ctx.addIssue({
        code: "custom",
        message: "Nome Completo deve ter no máximo 50 caracteres",
        path: ["name"],
      });
    }
  } else if (!isValidCnpj(canonical)) {
    ctx.addIssue({
      code: "custom",
      message: "CNPJ inválido",
      path: ["document"],
    });
  }
}

const newBusinessBaseSchema = z.object({
  isReseller: z.boolean(),
  documentType: z.enum(["CNPJ", "CPF"]),
  document: z.string(),
  name: z.string(),
  nomeFantasia: z.string().optional(),
  email: z
    .email("Insira um email válido")
    .max(50, "Email deve ter no máximo 50 caracteres"),
  celular: z
    .string()
    .refine(
      (value) => value.replace(/\D/g, "").length === 11,
      "Insira um celular válido",
    ),
  telefone: z.string(),
});

export const newBusinessSchema =
  newBusinessBaseSchema.superRefine(refineDocument);
