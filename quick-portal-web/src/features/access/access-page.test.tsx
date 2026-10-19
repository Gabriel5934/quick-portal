import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "#hooks/quickApi/useBusinesses";
import {
  useBusinessInvites,
  useBusinessMemberships,
  useCreateInvite,
  useEmailStatus,
  useRevokeAccess,
  useUpdateAccessRole,
} from "#hooks/quickApi/useBusinessAccess";
import { AccessPage } from "./access-page";
import type { BusinessInvite, BusinessMembership } from "./types";

vi.mock("#hooks/quickApi/useBusinessAccess", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("#hooks/quickApi/useBusinessAccess")>();
  return {
    ...original,
    useBusinessInvites: vi.fn(),
    useBusinessMemberships: vi.fn(),
    useCreateInvite: vi.fn(),
    useEmailStatus: vi.fn(),
    useRevokeAccess: vi.fn(),
    useUpdateAccessRole: vi.fn(),
  };
});
vi.mock("#hooks/storage", () => ({ getUserEmail: () => "admin@example.com" }));

const store = { id: 7, name: "Loja", trade_name: "" } as Business;
vi.mock("../../layout/business-context", () => ({
  useBusinessScope: () => ({ business: store }),
}));

const memberships: BusinessMembership[] = [
  { id: 1, user: 1, email: "admin@example.com", business: 7, role: "ADMIN" },
  {
    id: 2,
    user: 2,
    email: "gerente@example.com",
    business: 7,
    role: "MANAGER",
  },
];
const invites: BusinessInvite[] = [
  {
    id: 9,
    email: "novo@example.com",
    role: "VIEWER",
    registered: false,
    invited_by: 1,
    created_at: "2026-10-01T10:00:00Z",
  },
];

function mutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
    ...overrides,
  };
}

function rows() {
  const table = screen.getByRole("table", { name: "Acessos" });
  return within(table).getAllByRole("row").slice(1);
}

describe("AccessPage", () => {
  let updateRole: ReturnType<typeof mutation>;
  let revoke: ReturnType<typeof mutation>;
  let createInvite: ReturnType<typeof mutation>;

  beforeEach(() => {
    updateRole = mutation();
    revoke = mutation();
    createInvite = mutation();
    vi.mocked(useBusinessMemberships).mockReturnValue({
      data: memberships,
      isLoading: false,
      error: null,
    } as never);
    vi.mocked(useBusinessInvites).mockReturnValue({
      data: invites,
      isLoading: false,
      error: null,
    } as never);
    vi.mocked(useUpdateAccessRole).mockReturnValue(updateRole as never);
    vi.mocked(useRevokeAccess).mockReturnValue(revoke as never);
    vi.mocked(useCreateInvite).mockReturnValue(createInvite as never);
    vi.mocked(useEmailStatus).mockReturnValue({ data: undefined } as never);
  });

  it("lists accepted access and pending invites with their status", () => {
    render(<AccessPage />);

    const [admin, manager, pending] = rows();
    expect(admin).toHaveTextContent("admin@example.com (você)");
    expect(within(admin).getByText("Ativo")).toBeInTheDocument();
    expect(manager).toHaveTextContent("gerente@example.com");
    expect(within(pending).getByText("Convite pendente")).toBeInTheDocument();
    expect(within(pending).getByText("Não cadastrado")).toBeInTheDocument();
    expect(within(admin).queryByText("Não cadastrado")).not.toBeInTheDocument();
  });

  it("changes the role of a membership and of an invite", async () => {
    const user = userEvent.setup();
    render(<AccessPage />);

    await user.click(
      screen.getByRole("combobox", { name: "Papel de gerente@example.com" }),
    );
    await user.click(screen.getByRole("option", { name: "Visualizador" }));
    expect(updateRole.mutate).toHaveBeenCalledWith({
      kind: "membership",
      id: 2,
      role: "VIEWER",
    });

    await user.click(
      screen.getByRole("combobox", { name: "Papel de novo@example.com" }),
    );
    await user.click(screen.getByRole("option", { name: "Gerente" }));
    expect(updateRole.mutate).toHaveBeenCalledWith({
      kind: "invite",
      id: 9,
      role: "MANAGER",
    });
  });

  it("revokes access after confirmation", async () => {
    const user = userEvent.setup();
    render(<AccessPage />);

    await user.click(
      screen.getByRole("button", {
        name: "Revogar acesso de gerente@example.com",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Revogar acesso?" });
    expect(dialog).toHaveTextContent("gerente@example.com deixará de acessar");
    await user.click(within(dialog).getByRole("button", { name: "Revogar" }));

    expect(revoke.mutate).toHaveBeenCalledWith(
      { kind: "membership", id: 2 },
      expect.anything(),
    );
  });

  it("warns before revoking the user's own access", async () => {
    const user = userEvent.setup();
    render(<AccessPage />);

    await user.click(
      screen.getByRole("button", {
        name: "Revogar acesso de admin@example.com",
      }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Você perderá o acesso a esta empresa.",
    );
  });

  it("shows API errors from role changes", () => {
    vi.mocked(useUpdateAccessRole).mockReturnValue(
      mutation({
        error: new Error("The final admin cannot be removed or demoted."),
      }) as never,
    );
    render(<AccessPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The final admin cannot be removed or demoted.",
    );
  });

  it("warns about unregistered emails while inviting and after creating", async () => {
    vi.mocked(useEmailStatus).mockImplementation(
      (_businessId, email) =>
        ({
          data: email ? { email, registered: false } : undefined,
        }) as never,
    );
    const user = userEvent.setup();
    render(<AccessPage />);

    await user.click(screen.getByRole("button", { name: "Novo acesso" }));
    const dialog = screen.getByRole("dialog", { name: "Novo acesso" });
    await user.type(
      within(dialog).getByLabelText("E-mail"),
      "Pessoa@Example.com",
    );
    await waitFor(() =>
      expect(
        within(dialog).getByText("E-mail não cadastrado"),
      ).toBeInTheDocument(),
    );
    expect(useEmailStatus).toHaveBeenLastCalledWith(7, "pessoa@example.com");

    await user.click(
      within(dialog).getByRole("button", { name: "Conceder acesso" }),
    );
    await waitFor(() => expect(createInvite.mutate).toHaveBeenCalled());
    const [values, options] = createInvite.mutate.mock.calls[0] as [
      unknown,
      { onSuccess: (invite: BusinessInvite) => void },
    ];
    expect(values).toEqual({ email: "Pessoa@Example.com", role: "VIEWER" });

    options.onSuccess({ ...invites[0], email: "pessoa@example.com" });
    expect(
      await screen.findByText(/Convite enviado para pessoa@example.com/),
    ).toBeInTheDocument();
    expect(screen.getByText("E-mail não cadastrado")).toBeInTheDocument();
  });

  it("shows field errors returned by the API in the invite form", async () => {
    const user = userEvent.setup();
    render(<AccessPage />);

    await user.click(screen.getByRole("button", { name: "Novo acesso" }));
    const dialog = screen.getByRole("dialog", { name: "Novo acesso" });
    await user.type(
      within(dialog).getByLabelText("E-mail"),
      "gerente@example.com",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Conceder acesso" }),
    );
    await waitFor(() => expect(createInvite.mutate).toHaveBeenCalled());

    const { AccessRequestError } =
      await import("#hooks/quickApi/useBusinessAccess");
    const [, options] = createInvite.mutate.mock.calls[0] as [
      unknown,
      { onError: (error: Error) => void },
    ];
    options.onError(
      new AccessRequestError(400, "Este e-mail já tem acesso a esta empresa.", {
        email: ["Este e-mail já tem acesso a esta empresa."],
      }),
    );
    expect(
      await within(dialog).findByText(
        "Este e-mail já tem acesso a esta empresa.",
      ),
    ).toBeInTheDocument();
  });
});
