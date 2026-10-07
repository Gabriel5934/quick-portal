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
      Message: "The BankAccount field is required.",
    });
    return undefined;
  }

  const bank = requiredString(input, "Bank", 3, errors);
  const accountType = requiredString(input, "BankAccountType", 20, errors);
  const number = requiredString(input, "Number", 10, errors);
  const verifierDigit = requiredString(input, "VerifierDigit", 1, errors);
  const agencyNumber = requiredString(input, "AgencyNumber", 4, errors);
  const agencyDigit = optionalString(input, "AgencyDigit", 1, errors);
  const documentType = requiredString(input, "DocumentType", 4, errors);
  const documentNumber = requiredString(input, "DocumentNumber", 14, errors);

  requirePattern(
    bank,
    /^\d{3}$/,
    "BankAccount.Bank",
    "must contain three digits.",
    errors,
  );
  requirePattern(
    number,
    /^\d{1,10}$/,
    "BankAccount.Number",
    "must contain only digits.",
    errors,
  );
  requirePattern(
    verifierDigit,
    /^\d$/,
    "BankAccount.VerifierDigit",
    "must contain one digit.",
    errors,
  );
  requirePattern(
    agencyNumber,
    /^(?!0+$)\d{1,4}$/,
    "BankAccount.AgencyNumber",
    "must contain up to four digits and cannot be zero.",
    errors,
  );
  requirePattern(
    agencyDigit,
    /^\d$/,
    "BankAccount.AgencyDigit",
    "must contain one digit.",
    errors,
  );

  if (
    accountType &&
    !["CheckingAccount", "SavingsAccount"].includes(accountType)
  ) {
    errors.push({
      Code: "RequestValidationError",
      Message: "BankAccount.BankAccountType is invalid.",
    });
  }
  if (documentType && !["CPF", "CNPJ"].includes(documentType)) {
    errors.push({
      Code: "RequestValidationError",
      Message: "BankAccount.DocumentType is invalid.",
    });
  }
  if (documentType === "CPF") {
    requirePattern(
      documentNumber,
      /^\d{11}$/,
      "BankAccount.DocumentNumber",
      "must contain 11 digits for CPF.",
      errors,
    );
  } else if (documentType === "CNPJ") {
    requirePattern(
      documentNumber,
      /^[A-Z0-9]{12}\d{2}$/,
      "BankAccount.DocumentNumber",
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
    Bank: bank,
    BankAccountType: accountType as BankAccountPayload["BankAccountType"],
    Number: number,
    VerifierDigit: verifierDigit,
    AgencyNumber: agencyNumber,
    ...(agencyDigit ? { AgencyDigit: agencyDigit } : {}),
    DocumentType: documentType as BankAccountPayload["DocumentType"],
    DocumentNumber: documentNumber,
  };
}

function validateAddress(
  input: unknown,
  errors: CieloError[],
): AddressPayload | undefined {
  if (!isRecord(input)) {
    errors.push({
      Code: "RequestValidationError",
      Message: "The Address field is required.",
    });
    return undefined;
  }

  const number = requiredString(input, "Number", 15, errors);
  const complement = optionalString(input, "Complement", 80, errors);
  const zipCode = requiredString(input, "ZipCode", 9, errors);
  const street = requiredString(input, "Street", 100, errors);
  const neighborhood = requiredString(input, "Neighborhood", 50, errors);
  const city = requiredString(input, "City", 50, errors);
  const state = requiredString(input, "State", 2, errors);

  requirePattern(
    number,
    /^\d{1,15}$/,
    "Address.Number",
    "must contain only digits.",
    errors,
  );
  requirePattern(
    zipCode,
    /^\d{8,9}$/,
    "Address.ZipCode",
    "must contain 8 or 9 digits.",
    errors,
  );
  requirePattern(
    state,
    /^[A-Z]{2}$/,
    "Address.State",
    "must contain a two-letter state code.",
    errors,
  );

  if (!number || !zipCode || !street || !neighborhood || !city || !state) {
    return undefined;
  }
  return {
    Number: number,
    ...(complement !== undefined ? { Complement: complement } : {}),
    ZipCode: zipCode,
    Street: street,
    Neighborhood: neighborhood,
    City: city,
    State: state,
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

  const type = requiredString(input, "Type", 15, errors);
  const masterMerchantId = requiredString(
    input,
    "MasterMerchantId",
    36,
    errors,
  );
  const contactPhone = requiredString(input, "ContactPhone", 11, errors);
  const contactName = requiredString(input, "ContactName", 100, errors);
  const mailAddress = requiredString(input, "MailAddress", 50, errors);
  const website = optionalString(input, "Website", 200, errors);
  const documentType = requiredString(input, "DocumentType", 4, errors);
  const documentNumber = requiredString(input, "DocumentNumber", 14, errors);
  const corporateName = requiredString(input, "CorporateName", 100, errors);
  const fancyName = requiredStringAllowEmpty(input, "FancyName", 50, errors);
  const birthdayDate = optionalString(input, "BirthdayDate", 10, errors);
  const businessActivityId = optionalString(
    input,
    "BusinessActivityId",
    3,
    errors,
  );
  const bankAccount = validateBankAccount(input.BankAccount, errors);
  const address = validateAddress(input.Address, errors);

  if (type && type !== "Subordinate") {
    errors.push({
      Code: "RequestValidationError",
      Message: "Type must be Subordinate.",
    });
  }
  if (masterMerchantId && masterMerchantId !== MOCK_MERCHANT_ID) {
    errors.push({
      Code: "RequestValidationError",
      Message: "MasterMerchantId does not match the authenticated master.",
    });
  }
  requirePattern(
    contactPhone,
    /^\d{11}$/,
    "ContactPhone",
    "must contain 11 digits.",
    errors,
  );
  requirePattern(
    mailAddress,
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    "MailAddress",
    "must be a valid email address.",
    errors,
  );

  if (documentType && !["CPF", "CNPJ"].includes(documentType)) {
    errors.push({
      Code: "RequestValidationError",
      Message: "DocumentType is invalid.",
    });
  }
  if (documentType === "CPF") {
    requirePattern(
      documentNumber,
      /^\d{11}$/,
      "DocumentNumber",
      "must contain 11 digits for CPF.",
      errors,
    );
    requirePattern(
      birthdayDate,
      /^\d{4}-\d{2}-\d{2}$/,
      "BirthdayDate",
      "must use yyyy-MM-dd.",
      errors,
    );
    if (!birthdayDate) {
      errors.push({
        Code: "RequestValidationError",
        Message: "The BirthdayDate field is required for CPF.",
      });
    }
    if (!businessActivityId) {
      errors.push({
        Code: "RequestValidationError",
        Message: "The BusinessActivityId field is required for CPF.",
      });
    }
  } else if (documentType === "CNPJ") {
    requirePattern(
      documentNumber,
      /^[A-Z0-9]{12}\d{2}$/,
      "DocumentNumber",
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
      Type: "Subordinate",
      MasterMerchantId: masterMerchantId,
      ContactPhone: contactPhone,
      ContactName: contactName,
      MailAddress: mailAddress,
      ...(website !== undefined ? { Website: website } : {}),
      DocumentType: documentType as SellerPayload["DocumentType"],
      DocumentNumber: documentNumber,
      CorporateName: corporateName,
      FancyName: fancyName,
      ...(birthdayDate ? { BirthdayDate: birthdayDate } : {}),
      ...(businessActivityId ? { BusinessActivityId: businessActivityId } : {}),
      BankAccount: bankAccount,
      Address: address,
    },
  };
}
