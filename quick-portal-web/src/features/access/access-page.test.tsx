import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "#hooks/quickApi/useBusinesses";
import {
  AccessRequestError,
  useBusinessMemberships,
  useGrantAccess,
  useRevokeMembership,
  useUpdateMembershipRole,
} from "#hooks/quickApi/useBusinessAccess";
import { AccessPage } from "./access-page";
import type { BusinessMembership } from "./types";

vi.mock("#hooks/quickApi/useBusinessAccess", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("#hooks/quickApi/useBusinessAccess")>();
  return {
    ...original,
    useBusinessMemberships: vi.fn(),
    useGrantAccess: vi.fn(),
    useRevokeMembership: vi.fn(),
    useUpdateMembershipRole: vi.fn(),
  };
});
vi.mock("#hooks/storage", () => ({ getUserEmail: () => "admin@example.com" }));

const store = { id: 7, name: "Loja", trade_name: "" } as Business;
vi.mock("../../layout/business-context", () => ({
  useBusinessScope: () => ({ business: store }),
}));

function membership(
  id: number,
  email: string,
  role: BusinessMembership["role"],
): BusinessMembership {
  return { id, user: id, email, business: 7, role };
}

const memberships = [
  membership(1, "admin@example.com", "ADMIN"),
  membership(2, "gerente@example.com", "MANAGER"),
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

function mockMemberships(data: BusinessMembership[]) {
  vi.mocked(useBusinessMemberships).mockReturnValue({
    data,
    isLoading: false,
    error: null,
  } as never);
}

function rows() {
  const table = screen.getByRole("table", { name: "Acessos" });
  return within(table).getAllByRole("row").slice(1);
}

async function submitGrant(email: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Novo acesso" }));
  const dialog = screen.getByRole("dialog", { name: "Novo acesso" });
  await user.type(within(dialog).getByLabelText("E-mail"), email);
  await user.click(
    within(dialog).getByRole("button", { name: "Conceder acesso" }),
  );
  return dialog;
}

describe("AccessPage", () => {
  let updateRole: ReturnType<typeof mutation>;
  let revoke: ReturnType<typeof mutation>;
  let grantAccess: ReturnType<typeof mutation>;

  beforeEach(() => {
    updateRole = mutation();
    revoke = mutation();
    grantAccess = mutation();
    mockMemberships(memberships);
    vi.mocked(useUpdateMembershipRole).mockReturnValue(updateRole as never);
    vi.mocked(useRevokeMembership).mockReturnValue(revoke as never);
    vi.mocked(useGrantAccess).mockReturnValue(grantAccess as never);
  });

  it("lists everyone with access", () => {
    render(<AccessPage />);

    const [admin, manager] = rows();
    expect(admin).toHaveTextContent("admin@example.com (você)");
    expect(manager).toHaveTextContent("gerente@example.com");
  });

  it("changes a member's role", async () => {
    const user = userEvent.setup();
    render(<AccessPage />);

    await user.click(
      screen.getByRole("combobox", { name: "Papel de gerente@example.com" }),
    );
    await user.click(screen.getByRole("option", { name: "Visualizador" }));

    expect(updateRole.mutate).toHaveBeenCalledWith({ id: 2, role: "VIEWER" });
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

    expect(revoke.mutate).toHaveBeenCalledWith(2, expect.anything());
  });

  it("hides revoking the user's own access", () => {
    mockMemberships([
      ...memberships,
      membership(4, "outro.admin@example.com", "ADMIN"),
    ]);
    render(<AccessPage />);

    const [self, , otherAdmin] = rows();
    expect(within(self).queryByRole("button")).not.toBeInTheDocument();
    expect(
      within(self).getByRole("combobox", {
        name: "Papel de admin@example.com",
      }),
    ).not.toHaveAttribute("aria-disabled");
    expect(
      within(otherAdmin).getByRole("button", {
        name: "Revogar acesso de outro.admin@example.com",
      }),
    ).toBeInTheDocument();
  });

  it("locks the final admin", () => {
    mockMemberships([
      membership(1, "unico.admin@example.com", "ADMIN"),
      membership(2, "gerente@example.com", "MANAGER"),
    ]);
    render(<AccessPage />);

    const [finalAdmin, manager] = rows();
    expect(within(finalAdmin).queryByRole("button")).not.toBeInTheDocument();
    expect(
      within(finalAdmin).getByRole("combobox", {
        name: "Papel de unico.admin@example.com",
      }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(within(manager).getByRole("button")).toBeInTheDocument();
  });

  it("shows API errors from role changes", () => {
    vi.mocked(useUpdateMembershipRole).mockReturnValue(
      mutation({
        error: new Error("The final admin cannot be removed or demoted."),
      }) as never,
    );
    render(<AccessPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The final admin cannot be removed or demoted.",
    );
  });

  it("grants access and confirms it", async () => {
    render(<AccessPage />);

    await submitGrant("Colega@Example.com");
    await waitFor(() => expect(grantAccess.mutate).toHaveBeenCalled());
    const [values, options] = grantAccess.mutate.mock.calls[0] as [
      unknown,
      { onSuccess: (membership: BusinessMembership) => void },
    ];
    expect(values).toEqual({ email: "Colega@Example.com", role: "VIEWER" });

    options.onSuccess(membership(3, "colega@example.com", "VIEWER"));
    expect(
      await screen.findByText(/Acesso concedido a colega@example.com/),
    ).toBeInTheDocument();
  });

  it("shows on the email field that it is not registered", async () => {
    render(<AccessPage />);

    const dialog = await submitGrant("ninguem@example.com");
    await waitFor(() => expect(grantAccess.mutate).toHaveBeenCalled());
    const [, options] = grantAccess.mutate.mock.calls[0] as [
      unknown,
      { onError: (error: Error) => void },
    ];
    options.onError(
      new AccessRequestError(
        400,
        "Nenhum usuário cadastrado com este e-mail.",
        {
          email: ["Nenhum usuário cadastrado com este e-mail."],
        },
      ),
    );

    expect(
      await within(dialog).findByText(
        "Nenhum usuário cadastrado com este e-mail.",
      ),
    ).toBeInTheDocument();
  });
});
