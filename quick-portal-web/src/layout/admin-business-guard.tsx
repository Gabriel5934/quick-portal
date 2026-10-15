import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useBusinessScope } from "./business-context";

interface AdminBusinessGuardProps {
  children: ReactNode;
}

/** Sends users who are not admins of the selected business to Sales. */
export function AdminBusinessGuard({ children }: AdminBusinessGuardProps) {
  const { business } = useBusinessScope();

  if (business && business.role !== "ADMIN") {
    return <Navigate to="/sales" replace />;
  }

  return children;
}
