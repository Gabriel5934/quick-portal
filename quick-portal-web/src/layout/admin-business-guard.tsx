import type { ReactNode } from "react";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { Navigate } from "@tanstack/react-router";
import { useBusinessScope } from "./business-context";

interface AdminBusinessGuardProps {
  children: ReactNode;
}

/** Renders ``children`` only for admins of the selected business and sends
 * other members to Sales. */
export function AdminBusinessGuard({ children }: AdminBusinessGuardProps) {
  const { business, isLoading } = useBusinessScope();

  if (!business) {
    return isLoading ? (
      <CircularProgress aria-label="Carregando empresa" />
    ) : (
      <Alert severity="info">Selecione uma empresa.</Alert>
    );
  }

  if (business.role !== "ADMIN") {
    return <Navigate to="/sales" replace />;
  }

  return children;
}
