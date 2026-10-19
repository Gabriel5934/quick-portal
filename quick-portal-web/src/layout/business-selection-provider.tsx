import { useMemo, useState, type ReactNode } from "react";
import { BusinessSelectionContext } from "./business-selection";

/** Keeps the business picker's selection for every authenticated page, so
 * pages outside the business layout can choose the business it shows. */
export function BusinessSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedBusinessId, setSelectedBusinessId] = useState<
    number | null
  >();
  const selection = useMemo(
    () => ({ selectedBusinessId, selectBusiness: setSelectedBusinessId }),
    [selectedBusinessId],
  );

  return (
    <BusinessSelectionContext value={selection}>
      {children}
    </BusinessSelectionContext>
  );
}
