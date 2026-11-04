import { MOCK_MERCHANT_ID } from "./config.js";
import type {
  AddressPayload,
  BankAccountPayload,
  CieloError,
  SellerPayload,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function requiredString(
  object: UnknownRecord,
  field: string,
  maximum: number,
  errors: CieloError[],
): string | undefined {
  const value = object[field];
  if (typeof value !== "string" || value.length === 0) {
    errors.push({
      Code: "RequestValidationError",
      Message: `The ${field} field is required.`,
    });
    return undefined;
  }
  if (value.length > maximum) {
    errors.push({
      Code: "RequestValidationError",
      Message: `The ${field} field must not exceed ${maximum} characters.`,
    });
    return undefined;
  }
  return value;
}

function optionalString(
  object: UnknownRecord,
  field: string,
  maximum: number,
  errors: CieloError[],
): string | undefined {
  const value = object[field];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || value.length > maximum) {
    errors.push({
      Code: "RequestValidationError",
      Message: `The ${field} field must not exceed ${maximum} characters.`,
    });
    return undefined;
  }
  return value;
}

function requiredStringAllowEmpty(
  object: UnknownRecord,
  field: string,
  maximum: number,
  errors: CieloError[],
): string | undefined {
  const value = object[field];
  if (typeof value !== "string") {
    errors.push({
      Code: "RequestValidationError",
      Message: `The ${field} field is required.`,
    });
    return undefined;
  }
  if (value.length > maximum) {
    errors.push({
      Code: "RequestValidationError",
      Message: `The ${field} field must not exceed ${maximum} characters.`,
    });
    return undefined;
  }
  return value;
}

function requirePattern(
  value: string | undefined,
  pattern: RegExp,
  field: string,
  message: string,
  errors: CieloError[],
): void {
  if (value !== undefined && !pattern.test(value)) {
    errors.push({
      Code: "RequestValidationError",
      Message: `${field}: ${message}`,
    });
  }
}

function validateBankAccount(
  input: unknown,
  errors: CieloError[],
): BankAccountPayload | undefined {
  if (!isRecord(input)) {
    errors.push({
      Code: "RequestValidationError",
      Message: "The bankAccount field is required.",
    });
    return undefined;
  }

  const bank = requiredString(input, "bank", 3, errors);
  const accountType = requiredString(input, "bankAccountType", 20, errors);
  const number = requiredString(input, "number", 10, errors);
  const verifierDigit = requiredString(input, "verifierDigit", 1, errors);
  const agencyNumber = requiredString(input, "agencyNumber", 4, errors);
  const agencyDigit = optionalString(input, "agencyDigit", 1, errors);
  const documentType = requiredString(input, "documentType", 4, errors);
  const documentNumber = requiredString(input, "documentNumber", 14, errors);

  requirePattern(
    bank,
    /^\d{3}$/,
    "bankAccount.bank",
    "must contain three digits.",
    errors,
  );
  requirePattern(
    number,
    /^\d{1,10}$/,
    "bankAccount.number",
    "must contain only digits.",
    errors,
  );
  requirePattern(
    verifierDigit,
    /^\d$/,
    "bankAccount.verifierDigit",
    "must contain one digit.",
    errors,
  );
  requirePattern(
    agencyNumber,
    /^(?!0+$)\d{1,4}$/,
    "bankAccount.agencyNumber",
    "must contain up to four digits and cannot be zero.",
    errors,
  );
  // Cielo documents "x" for an agency without a digit.
  requirePattern(
    agencyDigit,
    /^(?:\d|x)$/,
    "bankAccount.agencyDigit",
    'must contain one digit or "x".',
    errors,
  );

  if (
    accountType &&
    !["CheckingAccount", "SavingsAccount"].includes(accountType)
  ) {
    errors.push({
      Code: "RequestValidationError",
      Message: "bankAccount.bankAccountType is invalid.",
    });
  }
  if (documentType && !["CPF", "CNPJ"].includes(documentType)) {
    errors.push({
      Code: "RequestValidationError",
      Message: "bankAccount.documentType is invalid.",
    });
  }
  if (documentType === "CPF") {
    requirePattern(
      documentNumber,
      /^\d{11}$/,
      "bankAccount.documentNumber",
      "must contain 11 digits for CPF.",
      errors,
    );
  } else if (documentType === "CNPJ") {
    requirePattern(
      documentNumber,
      /^[A-Z0-9]{12}\d{2}$/,
      "bankAccount.documentNumber",
      "must contain 14 canonical characters for CNPJ.",
      errors,
    );
  }

  if (
    !bank ||
    !accountType ||
    !number ||
    !verifierDigit ||
    !agencyNumber ||
    !documentType ||
    !documentNumber
  ) {
    return undefined;
  }

  return {
    bank: bank,
    bankAccountType: accountType as BankAccountPayload["bankAccountType"],
    number: number,
    verifierDigit: verifierDigit,
    agencyNumber: agencyNumber,
    ...(agencyDigit ? { agencyDigit: agencyDigit } : {}),
    documentType: documentType as BankAccountPayload["documentType"],
    documentNumber: documentNumber,
  };
}

function validateAddress(
  input: unknown,
  errors: CieloError[],
): AddressPayload | undefined {
  if (!isRecord(input)) {
    errors.push({
      Code: "RequestValidationError",
      Message: "The address field is required.",
    });
    return undefined;
  }

  const number = requiredString(input, "number", 15, errors);
  const complement = optionalString(input, "complement", 80, errors);
  const zipCode = requiredString(input, "zipCode", 9, errors);
  const street = requiredString(input, "street", 100, errors);
  const neighborhood = requiredString(input, "neighborhood", 50, errors);
  const city = requiredString(input, "city", 50, errors);
  const state = requiredString(input, "state", 2, errors);

  requirePattern(
    number,
    /^\d{1,15}$/,
    "address.number",
    "must contain only digits.",
    errors,
  );
  requirePattern(
    zipCode,
    /^\d{8,9}$/,
    "address.zipCode",
    "must contain 8 or 9 digits.",
    errors,
  );
  requirePattern(
    state,
    /^[A-Z]{2}$/,
    "address.state",
    "must contain a two-letter state code.",
    errors,
  );

  if (!number || !zipCode || !street || !neighborhood || !city || !state) {
    return undefined;
  }
  return {
    number: number,
    ...(complement !== undefined ? { complement: complement } : {}),
    zipCode: zipCode,
    street: street,
    neighborhood: neighborhood,
    city: city,
    state: state,
  };
}

export function validateSellerPayload(
  input: unknown,
):
  | { success: true; data: SellerPayload }
  | { success: false; errors: CieloError[] } {
  const errors: CieloError[] = [];
  if (!isRecord(input)) {
    return {
      success: false,
      errors: [
        {
          Code: "RequestValidationError",
          Message: "The request body must be a JSON object.",
        },
      ],
    };
  }

  const type = requiredString(input, "type", 15, errors);
  const masterMerchantId = requiredString(
    input,
    "masterMerchantId",
    36,
    errors,
  );
  const contactPhone = requiredString(input, "contactPhone", 11, errors);
  const contactName = requiredString(input, "contactName", 100, errors);
  const mailAddress = requiredString(input, "mailAddress", 50, errors);
  const website = optionalString(input, "website", 200, errors);
  const documentType = requiredString(input, "documentType", 4, errors);
  const documentNumber = requiredString(input, "documentNumber", 14, errors);
  const corporateName = requiredString(input, "corporateName", 100, errors);
  const fancyName = requiredStringAllowEmpty(input, "fancyName", 50, errors);
  const birthdayDate = optionalString(input, "birthdayDate", 10, errors);
  const businessActivityId = optionalString(
    input,
    "businessActivityId",
    3,
    errors,
  );
  const bankAccount = validateBankAccount(input.bankAccount, errors);
  const address = validateAddress(input.address, errors);

  if (type && type !== "Subordinate") {
    errors.push({
      Code: "RequestValidationError",
      Message: "type must be Subordinate.",
    });
  }
  if (masterMerchantId && masterMerchantId !== MOCK_MERCHANT_ID) {
    errors.push({
      Code: "RequestValidationError",
      Message: "masterMerchantId does not match the authenticated master.",
    });
  }
  requirePattern(
    contactPhone,
    /^\d{10,11}$/,
    "contactPhone",
    "must contain 10 or 11 digits.",
    errors,
  );
  requirePattern(
    mailAddress,
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    "mailAddress",
    "must be a valid email address.",
    errors,
  );

  if (documentType && !["CPF", "CNPJ"].includes(documentType)) {
    errors.push({
      Code: "RequestValidationError",
      Message: "documentType is invalid.",
    });
  }
  if (documentType === "CPF") {
    requirePattern(
      documentNumber,
      /^\d{11}$/,
      "documentNumber",
      "must contain 11 digits for CPF.",
      errors,
    );
    // Cielo expects yyyy/MM/dd on input; its sample responses show yyyy-MM-dd,
    // so that is accepted too, but not a mix of the two.
    requirePattern(
      birthdayDate,
      /^\d{4}([/-])\d{2}\1\d{2}$/,
      "birthdayDate",
      "must use yyyy/MM/dd.",
      errors,
    );
    if (!birthdayDate) {
      errors.push({
        Code: "RequestValidationError",
        Message: "The birthdayDate field is required for CPF.",
      });
    }
    if (!businessActivityId) {
      errors.push({
        Code: "RequestValidationError",
        Message: "The businessActivityId field is required for CPF.",
      });
    }
  } else if (documentType === "CNPJ") {
    requirePattern(
      documentNumber,
      /^[A-Z0-9]{12}\d{2}$/,
      "documentNumber",
      "must contain 14 canonical characters for CNPJ.",
      errors,
    );
  }

  if (
    errors.length > 0 ||
    !type ||
    !masterMerchantId ||
    !contactPhone ||
    !contactName ||
    !mailAddress ||
    !documentType ||
    !documentNumber ||
    !corporateName ||
    fancyName === undefined ||
    !bankAccount ||
    !address
  ) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      type: "Subordinate",
      masterMerchantId: masterMerchantId,
      contactPhone: contactPhone,
      contactName: contactName,
      mailAddress: mailAddress,
      ...(website !== undefined ? { website: website } : {}),
      documentType: documentType as SellerPayload["documentType"],
      documentNumber: documentNumber,
      corporateName: corporateName,
      fancyName: fancyName,
      ...(birthdayDate ? { birthdayDate: birthdayDate } : {}),
      ...(businessActivityId ? { businessActivityId: businessActivityId } : {}),
      bankAccount: bankAccount,
      address: address,
    },
  };
}
