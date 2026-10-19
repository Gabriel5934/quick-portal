import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AccessGrantRequest,
  BusinessMembership,
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

const membershipsKey = (businessId: number | undefined) => [
  "business-memberships",
  businessId,
];

function membershipsPath(businessId: number | undefined, id?: number) {
  return `businesses/${businessId}/memberships/${id === undefined ? "" : `${id}/`}`;
}

/** Users who can access `businessId`. Admins only. */
export function useBusinessMemberships(businessId: number | undefined) {
  const { data: token } = useToken();
  return useAuthQuery<BusinessMembership[]>({
    queryKey: membershipsKey(businessId),
    queryFn: () =>
      accessRequest(
        membershipsPath(businessId),
        token!,
        "Erro ao carregar os acessos.",
      ),
    enabled: !!token && !!businessId,
  });
}

/** Grants a role on `businessId` to the user registered with an email. */
export function useGrantAccess(businessId: number | undefined) {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AccessGrantRequest) =>
      accessRequest<BusinessMembership>(
        membershipsPath(businessId),
        token!,
        "Erro ao conceder o acesso.",
        { method: "POST", body: JSON.stringify(payload) },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: membershipsKey(businessId) }),
  });
}

// Changing a membership can change the requesting user's own role, so the
// businesses list is refreshed too.
function invalidateAfterChange(
  queryClient: ReturnType<typeof useQueryClient>,
  businessId: number | undefined,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: membershipsKey(businessId) }),
    queryClient.invalidateQueries({ queryKey: ["businesses", "all"] }),
  ]);
}

export function useUpdateMembershipRole(businessId: number | undefined) {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: Pick<BusinessMembership, "id" | "role">) =>
      accessRequest<BusinessMembership>(
        membershipsPath(businessId, id),
        token!,
        "Erro ao alterar o papel.",
        { method: "PATCH", body: JSON.stringify({ role }) },
      ),
    onSettled: () => invalidateAfterChange(queryClient, businessId),
  });
}

export function useRevokeMembership(businessId: number | undefined) {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      accessRequest<void>(
        membershipsPath(businessId, id),
        token!,
        "Erro ao revogar o acesso.",
        { method: "DELETE" },
      ),
    onSettled: () => invalidateAfterChange(queryClient, businessId),
  });
}
