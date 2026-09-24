import type { CieloBusinessFormValues } from "./schemas";

export type CieloDocumentType = "CPF" | "CNPJ";
export type CieloSubmissionStatus =
  | "FAILED"
  | "PENDING"
  | "INTERVENTION_REQUIRED";

export interface CieloOption {
  value: string;
  label: string;
}

export interface CieloBusinessSummary {
  id: number;
  business: number;
  status: CieloSubmissionStatus;
  merchant_id: string | null;
  last_submitted_at: string | null;
  retry_available_at: string | null;
  can_retry: boolean;
}

export interface CieloCreateRequest {
  contact_name?: string;
  website: string;
  birthday_date: string | null;
  business_activity_id: string | null;
  bank_account: {
    bank: string;
    bank_account_type: string;
    number: string;
    verifier_digit: string;
    agency_number: string;
    agency_digit?: string;
    document_type: CieloDocumentType;
    document_number: string;
  };
  address: {
    number: string;
    complement: string;
    zip_code: string;
  };
}

export type { CieloBusinessFormValues };
