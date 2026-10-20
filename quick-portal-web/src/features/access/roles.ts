import type { BusinessRole } from "#hooks/quickApi/useBusinesses";

export const ROLE_LABELS: Record<BusinessRole, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  VIEWER: "Visualizador",
};

export const ROLES = Object.keys(ROLE_LABELS) as BusinessRole[];
