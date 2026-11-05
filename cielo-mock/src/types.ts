export interface BankAccountPayload {
  bank: string;
  bankAccountType: "CheckingAccount" | "SavingsAccount";
  number: string;
  verifierDigit: string;
  agencyNumber: string;
  agencyDigit?: string;
  documentType: "CPF" | "CNPJ";
  documentNumber: string;
}

export interface AddressPayload {
  number: string;
  complement?: string;
  zipCode: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface SellerPayload {
  type: "Subordinate";
  masterMerchantId: string;
  contactPhone: string;
  contactName: string;
  mailAddress: string;
  website?: string;
  documentType: "CPF" | "CNPJ";
  documentNumber: string;
  corporateName: string;
  fancyName: string;
  birthdayDate?: string;
  businessActivityId?: string;
  bankAccount: BankAccountPayload;
  address: AddressPayload;
}

export interface CieloError {
  Code: string;
  Message: string;
}

export interface StoredSeller {
  merchantId: string;
  status: "Pending";
  createdAt: string;
  onboardingData: SellerPayload;
}

/**
 * The `201` body of `POST /api/merchants`, a subset of Cielo's documented
 * response. Cielo's `documentType` is numeric (1 = CPF, 2 = CNPJ), unlike the
 * request's string. `merchantId` repeats `id` because clients of this
 * contract read that key.
 */
export interface SellerCreatedResponse {
  id: string;
  merchantId: string;
  type: "Subordinate";
  masterMerchantId: string;
  corporateName: string;
  fancyName: string;
  documentType: 1 | 2;
  documentNumber: string;
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
