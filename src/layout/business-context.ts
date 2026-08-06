import { createContext, useContext } from "react";
import type { Business } from "#hooks/quickApi/useBusinesses";

export interface BusinessScope {
  business: Business | null;
}

export const BusinessScopeContext = createContext<BusinessScope | null>(null);

export function useBusinessScope(): BusinessScope {
  const context = useContext(BusinessScopeContext);
  if (!context) {
    throw new Error("useBusinessScope must be used inside BusinessLayout.");
  }
  return context;
}
