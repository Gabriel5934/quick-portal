import { createContext, useContext } from "react";

export interface BusinessSelection {
  /** The business chosen in the picker: ``undefined`` until one is chosen,
   * ``null`` once the picker is cleared. */
  selectedBusinessId: number | null | undefined;
  selectBusiness: (id: number | null) => void;
}

export const BusinessSelectionContext =
  createContext<BusinessSelection | null>(null);

export function useBusinessSelection(): BusinessSelection {
  const context = useContext(BusinessSelectionContext);
  if (!context) {
    throw new Error(
      "useBusinessSelection must be used inside BusinessSelectionProvider.",
    );
  }
  return context;
}
