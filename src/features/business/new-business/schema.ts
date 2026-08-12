import { z } from "zod";

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
    if (digits.length < 11) {
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
  } else if (digits.length < 14) {
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
  cnaeId: z.number().int().positive().optional(),
  email: z.email("Insira um email válido"),
  celular: z
    .string()
    .refine(
      (value) => value.replace(/\D/g, "").length >= 11,
      "Insira um celular válido",
    ),
  telefone: z.string(),
});

export const newBusinessSchema =
  newBusinessBaseSchema.superRefine(refineDocument);
