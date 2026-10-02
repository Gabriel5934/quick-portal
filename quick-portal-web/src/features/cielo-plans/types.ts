import type { CieloPlanFormValues } from "./schemas";

export type CieloCardBrand = "Visa" | "Elo" | "MasterCard";
export type CieloPaymentMethod = "Debit" | "Credit";

export interface CieloPlanRate {
  card_brand: CieloCardBrand;
  method: CieloPaymentMethod;
  installments: number | null;
  mdr: string;
  fixed_fee: string;
}

export interface CieloPlanSummary {
  id: number;
  owner_business: number;
  name: string;
  description: string;
  created_by: number;
  created_at: string;
  archived_at: string | null;
  archived_by: number | null;
}

export interface CieloPlan extends CieloPlanSummary {
  rates: CieloPlanRate[];
}

export interface CieloPlanCreateRequest {
  name: string;
  description: string;
  rates: CieloPlanRate[];
}

export type { CieloPlanFormValues };
