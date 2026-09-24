export interface BankAccountPayload {
  Bank: string;
  BankAccountType: "CheckingAccount" | "SavingsAccount";
  Number: string;
  VerifierDigit: string;
  AgencyNumber: string;
  AgencyDigit?: string;
  DocumentType: "CPF" | "CNPJ";
  DocumentNumber: string;
}

export interface AddressPayload {
  Number: string;
  Complement?: string;
  ZipCode: string;
  Street: string;
  Neighborhood: string;
  City: string;
  State: string;
}

export interface SellerPayload {
  Type: "Subordinate";
  MasterMerchantId: string;
  ContactPhone: string;
  ContactName: string;
  MailAddress: string;
  Website?: string;
  DocumentType: "CPF" | "CNPJ";
  DocumentNumber: string;
  CorporateName: string;
  FancyName: string;
  BirthdayDate?: string;
  BusinessActivityId?: string;
  BankAccount: BankAccountPayload;
  Address: AddressPayload;
}

export interface CieloError {
  Code: string;
  Message: string;
}

export interface StoredSeller {
  MerchantId: string;
  Status: "Pending";
  CreatedAt: string;
  OnboardingData: SellerPayload;
}

export interface OnboardingAttempt {
  AttemptedAt: string;
  DocumentNumber: string | null;
  Request: unknown;
  ResponseStatus: number;
  ResponseBody: unknown;
}

export interface MockDatabase {
  sellers: StoredSeller[];
  onboardingAttempts: OnboardingAttempt[];
}
