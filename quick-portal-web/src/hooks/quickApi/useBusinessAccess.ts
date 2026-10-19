import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AccessKind,
  BusinessInvite,
  BusinessMembership,
  EmailStatus,
  InviteCreateRequest,
  ReceivedInvite,
} from "#features/access/types";
import { ApiError, useAuthQuery } from "#hooks/auth/useAuthQuery";
import { useToken } from "#hooks/auth/useToken";
import type { BusinessRole } from "./useBusinesses";

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
const membershipsKey = (businessId: number | undefined) => [
  ...accessKey(businessId),
  "memberships",
];
const invitesKey = (businessId: number | undefined) => [
  ...accessKey(businessId),
  "invites",
];
const RECEIVED_INVITES_KEY = ["received-invites"];

function accessPath(businessId: number | undefined, kind: AccessKind) {
  return `businesses/${businessId}/${kind === "membership" ? "memberships" : "invites"}/`;
}

/** Users who accepted an invite (or created) `businessId`. Admins only. */
export function useBusinessMemberships(businessId: number | undefined) {
  const { data: token } = useToken();
  return useAuthQuery<BusinessMembership[]>({
    queryKey: membershipsKey(businessId),
    queryFn: () =>
      accessRequest(
        accessPath(businessId, "membership"),
        token!,
        "Erro ao carregar os acessos.",
      ),
    enabled: !!token && !!businessId,
  });
}

/** Pending invites of `businessId`. Admins only. */
export function useBusinessInvites(businessId: number | undefined) {
  const { data: token } = useToken();
  return useAuthQuery<BusinessInvite[]>({
    queryKey: invitesKey(businessId),
    queryFn: () =>
      accessRequest(
        accessPath(businessId, "invite"),
        token!,
        "Erro ao carregar os convites.",
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
        `businesses/${businessId}/invites/email-status/?email=${encodeURIComponent(email!)}`,
        token!,
        "Erro ao verificar o e-mail.",
      ),
    enabled: !!token && !!businessId && !!email,
    staleTime: 60 * 1000,
  });
}

export function useCreateInvite(businessId: number | undefined) {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InviteCreateRequest) =>
      accessRequest<BusinessInvite>(
        accessPath(businessId, "invite"),
        token!,
        "Erro ao criar o acesso.",
        { method: "POST", body: JSON.stringify(payload) },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: invitesKey(businessId) }),
  });
}

// Changing or revoking a membership can change the requesting user's own
// role, so the businesses list is refreshed too.
function invalidateAfterChange(
  queryClient: ReturnType<typeof useQueryClient>,
  businessId: number | undefined,
  kind: AccessKind,
) {
  if (kind === "invite") {
    return queryClient.invalidateQueries({ queryKey: invitesKey(businessId) });
  }
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: membershipsKey(businessId) }),
    queryClient.invalidateQueries({ queryKey: ["businesses", "all"] }),
  ]);
}

export function useUpdateAccessRole(businessId: number | undefined) {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      id,
      role,
    }: {
      kind: AccessKind;
      id: number;
      role: BusinessRole;
    }) =>
      accessRequest(
        `${accessPath(businessId, kind)}${id}/`,
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
    mutationFn: ({ kind, id }: { kind: AccessKind; id: number }) =>
      accessRequest<void>(
        `${accessPath(businessId, kind)}${id}/`,
        token!,
        "Erro ao revogar o acesso.",
        { method: "DELETE" },
      ),
    onSettled: (_data, _error, { kind }) =>
      invalidateAfterChange(queryClient, businessId, kind),
  });
}

/** Pending invites sent to the authenticated user's email. */
export function useReceivedInvites() {
  const { data: token } = useToken();
  return useAuthQuery<ReceivedInvite[]>({
    queryKey: RECEIVED_INVITES_KEY,
    queryFn: () =>
      accessRequest("invites/", token!, "Erro ao carregar os convites."),
    enabled: !!token,
  });
}

export function useAcceptInvite() {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      accessRequest<BusinessMembership>(
        `invites/${id}/accept/`,
        token!,
        "Erro ao aceitar o convite.",
        { method: "POST" },
      ),
    // The business list refetches even while unmounted so the accepted
    // business can be selected right away.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: RECEIVED_INVITES_KEY }),
        queryClient.invalidateQueries({
          queryKey: ["businesses", "all"],
          refetchType: "all",
        }),
      ]),
  });
}

export function useDeclineInvite() {
  const { data: token } = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      accessRequest<void>(
        `invites/${id}/`,
        token!,
        "Erro ao recusar o convite.",
        {
          method: "DELETE",
        },
      ),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: RECEIVED_INVITES_KEY }),
  });
}
