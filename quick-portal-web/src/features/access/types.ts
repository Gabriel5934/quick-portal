import type { BusinessRole } from "#hooks/quickApi/useBusinesses";

/** Access of a registered user is a membership; access granted to an email
 * nobody signed up with yet is an invite, which becomes a membership when
 * someone signs up with it. */
export type AccessKind = "membership" | "invite";

/** One person who can access a business. */
export interface AccessRow {
  kind: AccessKind;
  id: number;
  email: string;
  role: BusinessRole;
  /** Whether a user already signed up with `email`. */
  registered: boolean;
}

export interface AccessGrantRequest {
  email: string;
  role: BusinessRole;
}

export interface EmailStatus {
  email: string;
  registered: boolean;
}
