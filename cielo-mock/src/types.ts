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

/**
 * The `201` body of `POST /api/merchants`, a subset of Cielo's documented
 * response. Cielo's `DocumentType` is numeric (1 = CPF, 2 = CNPJ), unlike the
 * request's string. `MerchantId` repeats `Id` for quick-portal-api, which
 * reads that key.
 */
export interface SellerCreatedResponse {
  Id: string;
  MerchantId: string;
  Type: "Subordinate";
  MasterMerchantId: string;
  CorporateName: string;
  FancyName: string;
  DocumentType: 1 | 2;
  DocumentNumber: string;
}

export type TransactionPaymentType = "CreditCard" | "DebitCard" | "Pix" | "Boleto";

export interface TransactionCard {
  CardNumber: string;
  Holder: string;
  ExpirationDate: string;
  Brand: string;
}

/** A transaction lookup response, in the shape of Cielo's `GET /1/sales/{id}`. */
export interface TransactionResponse {
  MerchantId: string;
  MerchantOrderId: string;
  IsSplitted: boolean;
  Customer: { Name: string; Identity: string; IdentityType: string };
  Payment: {
    PaymentId: string;
    Type: TransactionPaymentType;
    Amount: number;
    Installments?: number;
    CreditCard?: TransactionCard;
    DebitCard?: TransactionCard;
    ReceivedDate: string;
    Currency: string;
    Country: string;
    Provider: string;
    Status: number;
  };
}
