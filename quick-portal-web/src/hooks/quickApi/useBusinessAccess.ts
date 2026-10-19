import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AccessGrantRequest,
  AccessKind,
  AccessRow,
  EmailStatus,
} from "#features/access/types";
import { ApiError, useAuthQuery } from "#hooks/auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";

/** A failed access request; `body` keeps the DRF field errors. */
export class AccessRequestError extends ApiError {
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(status, message);
    this.name = "AccessRequestError";
    this.body = body;
  }
}

function firstErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const message = firstErrorMessage(item);
      if (message) return message;
    }
  }
  return undefined;
}

async function accessRequest<T>(
  path: string,
  token: string,
  fallbackMessage: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/api/${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AccessRequestError(
      response.status,
      firstErrorMessage(body) ?? fallbackMessage,
      body,
    );
  }
  return body as T;
}

const accessKey = (businessId: number | undefined) => [
  "business-access",
  businessId,
];
const rowsKey = (businessId: number | undefined) => [
  ...accessKey(businessId),
  "rows",
];

/** Path of membership or invite `id` on `businessId`. */
function rowPath(businessId: number | undefined, kind: AccessKind, id: number) {
  return `businesses/${businessId}/${kind === "membership" ? "memberships" : "invites"}/${id}/`;
}

/** Everyone who can access `businessId`. Admins only. */
export function useBusinessAccess(businessId: number | undefined) {
  const { data: token } = useToken();
  return useAuthQuery<AccessRow[]>({
    queryKey: rowsKey(businessId),
    queryFn: () =>
      accessRequest(
        `businesses/${businessId}/access/`,
        token!,
        "Erro ao carregar os acessos.",
      ),
    enabled: !!token && !!businessId,
  });
}

/** Whether `email` already belongs to a user; disabled until it is set. */
export function useEmailStatus(
  businessId: number | undefined,
  email: string | null,
) {
  const { data: token } = useToken();
  return useAuthQuery<EmailStatus>({
    queryKey: [...accessKey(businessId), "email-status", email],
    queryFn: () =>
      accessRequest(
        `businesses/${businessId}/access/email-status/?email=${encodeURIComponent(email!)}`,
        token!,
        "Erro ao verificar o e-mail.",
      ),
    enabled: !!token && !!businessId && !!email,
    staleTime: 60 * 1000,
  });
}

export function useGrantAccess(businessId: number | undefined) {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AccessGrantRequest) =>
      accessRequest<AccessRow>(
        `businesses/${businessId}/access/`,
        token!,
        "Erro ao conceder o acesso.",
        { method: "POST", body: JSON.stringify(payload) },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: rowsKey(businessId) }),
  });
}

// Changing or revoking a membership can change the requesting user's own
// role, so the businesses list is refreshed too.
function invalidateAfterChange(
  queryClient: ReturnType<typeof useQueryClient>,
  businessId: number | undefined,
  kind: AccessKind,
) {
  const rows = queryClient.invalidateQueries({ queryKey: rowsKey(businessId) });
  if (kind === "invite") return rows;
  return Promise.all([
    rows,
    queryClient.invalidateQueries({ queryKey: ["businesses", "all"] }),
  ]);
}

export function useUpdateAccessRole(businessId: number | undefined) {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id, role }: Pick<AccessRow, "kind" | "id" | "role">) =>
      accessRequest(
        rowPath(businessId, kind, id),
        token!,
        "Erro ao alterar o papel.",
        { method: "PATCH", body: JSON.stringify({ role }) },
      ),
    onSettled: (_data, _error, { kind }) =>
      invalidateAfterChange(queryClient, businessId, kind),
  });
}

export function useRevokeAccess(businessId: number | undefined) {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: Pick<AccessRow, "kind" | "id">) =>
      accessRequest<void>(
        rowPath(businessId, kind, id),
        token!,
        "Erro ao revogar o acesso.",
        { method: "DELETE" },
      ),
    onSettled: (_data, _error, { kind }) =>
      invalidateAfterChange(queryClient, businessId, kind),
  });
}
