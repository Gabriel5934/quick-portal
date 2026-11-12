/** Shapes exchanged with Quick API (quick-api/app/auth and app/cielo schemas). */

import type { DocumentType } from '@/lib/mask';

/** The access token kept in the TanStack Query cache. */
export type Session = {
  accessToken: string;
  /** Epoch milliseconds after which the token must be refreshed. */
  expiresAt: number;
};

export type LoginInput = { email: string; password: string };

/** `POST /auth/register` body. */
export type RegisterInput = { email: string; password: string; turnstile_token: string };

/** `POST /auth/register` 201 body. Registering does not sign the user in. */
export type RegisteredUser = { id: string; email: string };

/** `GET /auth/me`. */
export type Me = { id: string; email: string };

/** `GET /cielo/get-sellers` items and the `POST /cielo/onboard` 201 body. */
export type CieloSeller = {
  id: string;
  document_type: DocumentType;
  document_number: string;
  fancy_name: string;
};

export type BankAccountType = 'CheckingAccount' | 'SavingsAccount';

/** `POST /cielo/onboard` body (OnboardIn), snake_case. */
export type OnboardPayload = {
  contact_name: string;
  contact_phone: string;
  corporate_name: string;
  document_number: string;
  document_type: DocumentType;
  fancy_name: string;
  mail_address: string;
  website?: string;
  /** YYYY/MM/DD; CPF only. */
  birthday_date?: string;
  /** CPF only. */
  business_activity_id?: string;
  bank_account: {
    bank: string;
    bank_account_type: BankAccountType;
    number: string;
    verifier_digit: string;
    agency_number: string;
    /** "x" when the agency has no digit. */
    agency_digit: string;
  };
  address: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zip_code: string;
  };
};
