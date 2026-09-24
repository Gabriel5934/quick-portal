import { z } from "zod";
import { isValidCnpj, isValidCpf, normalizeDocument } from "./validators";

export const documentTypeSchema = z.enum(["CPF", "CNPJ"]);

const identificationFieldsSchema = z.object({
  contactName: z.string().trim().max(100),
  website: z
    .string()
    .max(200)
    .refine(
      (value) => value === "" || z.url().safeParse(value).success,
      "Site inválido",
    ),
  birthdayDate: z.string(),
  businessActivityId: z.string(),
  corporateName: z.string(),
  fancyName: z.string(),
});

export function createIdentificationSchema(documentType: "CPF" | "CNPJ") {
  return identificationFieldsSchema.superRefine((values, context) => {
    if (documentType === "CPF") {
      if (!values.birthdayDate) {
        context.addIssue({
          code: "custom",
          path: ["birthdayDate"],
          message: "Data de nascimento é obrigatória",
        });
      }
      if (!values.businessActivityId) {
        context.addIssue({
          code: "custom",
          path: ["businessActivityId"],
          message: "Ramo de atividade é obrigatório",
        });
      }
    } else {
      if (!values.contactName) {
        context.addIssue({
          code: "custom",
          path: ["contactName"],
          message: "Nome do contato é obrigatório",
        });
      }
      if (!values.corporateName) {
        context.addIssue({
          code: "custom",
          path: ["corporateName"],
          message: "Aguarde a consulta do CNPJ na BrasilAPI",
        });
      }
    }
  });
}

export const addressSchema = z.object({
  addressZipCode: z
    .string()
    .min(1, "CEP é obrigatório")
    .refine(
      (value) => value === "" || value.replace(/\D/g, "").length === 8,
      "CEP inválido",
    ),
  addressNumber: z
    .string()
    .min(1, "Número é obrigatório")
    .refine(
      (value) => value === "" || /^\d+$/.test(value),
      "Número deve conter apenas dígitos",
    )
    .max(15),
  addressComplement: z.string().max(80),
  addressStreet: z.string().min(1, "Rua é obrigatória").max(100),
  addressNeighborhood: z.string().min(1, "Bairro é obrigatório").max(50),
  addressCity: z.string().min(1, "Cidade é obrigatória").max(50),
  addressState: z
    .string()
    .min(1, "Estado é obrigatório")
    .refine((value) => value === "" || value.length === 2, "Estado inválido"),
});

export const bankAccountSchema = z
  .object({
    bank: z.string().min(1, "Banco é obrigatório"),
    bankAccountType: z.string().min(1, "Tipo de conta é obrigatório"),
    bankAccountNumber: z
      .string()
      .min(1, "Número da conta é obrigatório")
      .refine(
        (value) => value === "" || /^\d+$/.test(value),
        "Conta deve conter apenas dígitos",
      )
      .max(10),
    bankAccountVerifierDigit: z
      .string()
      .min(1, "Dígito da conta é obrigatório")
      .refine(
        (value) => value === "" || /^\d$/.test(value),
        "Dígito da conta inválido",
      ),
    bankAgencyNumber: z
      .string()
      .min(1, "Agência é obrigatória")
      .refine(
        (value) => value === "" || /^\d{1,4}$/.test(value),
        "Agência deve ter até 4 dígitos",
      )
      .refine(
        (value) => !/^0+$/.test(value),
        "Agência não pode conter apenas zeros",
      ),
    bankAgencyDigit: z
      .string()
      .refine(
        (value) => value === "" || /^\d$/.test(value),
        "Dígito da agência inválido",
      ),
    sameBankDocument: z.boolean(),
    bankDocumentType: documentTypeSchema,
    bankDocumentNumber: z.string().min(1, "Documento do titular é obrigatório"),
  })
  .superRefine((values, context) => {
    if (!values.bankDocumentNumber) return;
    const canonical = normalizeDocument(
      values.bankDocumentNumber,
      values.bankDocumentType,
    );
    const valid =
      values.bankDocumentType === "CPF"
        ? isValidCpf(canonical)
        : isValidCnpj(canonical);
    if (!valid) {
      context.addIssue({
        code: "custom",
        path: ["bankDocumentNumber"],
        message: `${values.bankDocumentType} inválido`,
      });
    }
  });

const cieloBusinessFieldsSchema = z
  .object({})
  .extend(identificationFieldsSchema.shape)
  .extend(addressSchema.shape)
  .extend(bankAccountSchema.shape);

export function createCieloBusinessSchema(documentType: "CPF" | "CNPJ") {
  const identificationSchema = createIdentificationSchema(documentType);
  return cieloBusinessFieldsSchema.superRefine((values, context) => {
    const result = identificationSchema.safeParse(values);
    if (!result.success)
      result.error.issues.forEach((issue) =>
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        }),
      );
    const bankResult = bankAccountSchema.safeParse(values);
    if (!bankResult.success)
      bankResult.error.issues.forEach((issue) =>
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        }),
      );
  });
}

export type CieloBusinessFormValues = z.infer<typeof cieloBusinessFieldsSchema>;
