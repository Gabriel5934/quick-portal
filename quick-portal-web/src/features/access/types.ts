import type { BusinessRole } from "#hooks/quickApi/useBusinesses";

/** A registered user's access to a business. */
export interface BusinessMembership {
  id: number;
  user: number;
  email: string;
  business: number;
  role: BusinessRole;
}

export interface AccessGrantRequest {
  email: string;
  role: BusinessRole;
}
