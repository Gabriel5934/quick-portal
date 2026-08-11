import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useBusinessScope } from "../../layout/business-context";

export function RecurringFeeBusinessGuard({
  children,
}: {
  children: ReactNode;
}) {
  const { business } = useBusinessScope();
  if (business?.type === "STORE") return <Navigate to="/sales" replace />;
  return children;
}
