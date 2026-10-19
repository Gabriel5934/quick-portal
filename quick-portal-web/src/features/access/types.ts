import type { BusinessRole, BusinessType } from "#hooks/quickApi/useBusinesses";

/** Accepted access is a membership; pending access is an invite. */
export type AccessKind = "membership" | "invite";

export interface BusinessMembership {
  id: number;
  user: number;
  email: string;
  business: number;
  role: BusinessRole;
}

export interface BusinessInvite {
  id: number;
  email: string;
  role: BusinessRole;
  /** Whether a user already signed up with `email`. */
  registered: boolean;
  invited_by: number | null;
  created_at: string;
}

export interface InviteCreateRequest {
  email: string;
  role: BusinessRole;
}

export interface EmailStatus {
  email: string;
  registered: boolean;
}

export interface ReceivedInvite {
  id: number;
  business: {
    id: number;
    type: BusinessType;
    name: string;
    trade_name: string;
  };
  role: BusinessRole;
  invited_by_email: string | null;
  created_at: string;
}

/** One row of the access table, either accepted or pending. */
export interface AccessRow {
  kind: AccessKind;
  id: number;
  email: string;
  role: BusinessRole;
  registered: boolean;
}
