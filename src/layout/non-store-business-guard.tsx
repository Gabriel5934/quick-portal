import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useBusinessScope } from "./business-context";

interface NonStoreBusinessGuardProps {
  children: ReactNode;
}

export function NonStoreBusinessGuard({
  children,
}: NonStoreBusinessGuardProps) {
  const { business } = useBusinessScope();

  if (business?.type === "STORE") {
    return <Navigate to="/sales" replace />;
  }

  return children;
}
