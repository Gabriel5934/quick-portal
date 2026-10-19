import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "#hooks/quickApi/useBusinesses";
import {
  AccessRequestError,
  useBusinessAccess,
  useEmailStatus,
  useGrantAccess,
  useRevokeAccess,
  useUpdateAccessRole,
} from "#hooks/quickApi/useBusinessAccess";
import { AccessPage } from "./access-page";
import type { AccessRow } from "./types";

vi.mock("#hooks/quickApi/useBusinessAccess", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("#hooks/quickApi/useBusinessAccess")>();
  return {
    ...original,
    useBusinessAccess: vi.fn(),
    useEmailStatus: vi.fn(),
    useGrantAccess: vi.fn(),
    useRevokeAccess: vi.fn(),
    useUpdateAccessRole: vi.fn(),
  };
});
vi.mock("#hooks/storage", () => ({ getUserEmail: () => "admin@example.com" }));

const store = { id: 7, name: "Loja", trade_name: "" } as Business;
vi.mock("../../layout/business-context", () => ({
  useBusinessScope: () => ({ business: store }),
}));

const access: AccessRow[] = [
  {
    kind: "membership",
    id: 1,
    email: "admin@example.com",
    role: "ADMIN",
    registered: true,
  },
  {
    kind: "membership",
    id: 2,
    email: "gerente@example.com",
    role: "MANAGER",
    registered: true,
  },
  {
    kind: "invite",
    id: 9,
    email: "novo@example.com",
    role: "VIEWER",
    registered: false,
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
  let grantAccess: ReturnType<typeof mutation>;

  beforeEach(() => {
    updateRole = mutation();
    revoke = mutation();
    grantAccess = mutation();
    vi.mocked(useBusinessAccess).mockReturnValue({
      data: access,
      isLoading: false,
      error: null,
    } as never);
    vi.mocked(useUpdateAccessRole).mockReturnValue(updateRole as never);
    vi.mocked(useRevokeAccess).mockReturnValue(revoke as never);
    vi.mocked(useGrantAccess).mockReturnValue(grantAccess as never);
    vi.mocked(useEmailStatus).mockReturnValue({ data: undefined } as never);
  });

  it("lists everyone with access and flags unregistered emails", () => {
    render(<AccessPage />);

    const [admin, manager, unregistered] = rows();
    expect(admin).toHaveTextContent("admin@example.com (você)");
    expect(within(admin).getByText("Ativo")).toBeInTheDocument();
    expect(manager).toHaveTextContent("gerente@example.com");
    expect(within(manager).getByText("Ativo")).toBeInTheDocument();
    expect(
      within(unregistered).getByText("Não cadastrado"),
    ).toBeInTheDocument();
    expect(within(unregistered).queryByText("Ativo")).not.toBeInTheDocument();
  });

  it("changes the role of registered and unregistered access", async () => {
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

  it("hides revoking the user's own access", () => {
    vi.mocked(useBusinessAccess).mockReturnValue({
      data: [
        ...access,
        {
          kind: "membership",
          id: 4,
          email: "outro.admin@example.com",
          role: "ADMIN",
          registered: true,
        },
      ],
      isLoading: false,
      error: null,
    } as never);
    render(<AccessPage />);

    const [self, , , otherAdmin] = rows();
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
    vi.mocked(useBusinessAccess).mockReturnValue({
      data: [
        {
          kind: "membership",
          id: 1,
          email: "unico.admin@example.com",
          role: "ADMIN",
          registered: true,
        },
        // An unregistered admin does not count until they sign up.
        { ...access[2], role: "ADMIN" },
      ],
      isLoading: false,
      error: null,
    } as never);
    render(<AccessPage />);

    const [finalAdmin, unregistered] = rows();
    expect(within(finalAdmin).queryByRole("button")).not.toBeInTheDocument();
    expect(
      within(finalAdmin).getByRole("combobox", {
        name: "Papel de unico.admin@example.com",
      }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(unregistered).getByRole("button", {
        name: "Revogar acesso de novo@example.com",
      }),
    ).toBeInTheDocument();
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

  it("warns about unregistered emails while granting and after granting", async () => {
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
    await waitFor(() => expect(grantAccess.mutate).toHaveBeenCalled());
    const [values, options] = grantAccess.mutate.mock.calls[0] as [
      unknown,
      { onSuccess: (row: AccessRow) => void },
    ];
    expect(values).toEqual({ email: "Pessoa@Example.com", role: "VIEWER" });

    options.onSuccess({ ...access[2], email: "pessoa@example.com" });
    expect(
      await screen.findByText(/Acesso concedido a pessoa@example.com/),
    ).toBeInTheDocument();
    expect(screen.getByText("E-mail não cadastrado")).toBeInTheDocument();
  });

  it("does not warn after granting access to a registered email", async () => {
    const user = userEvent.setup();
    render(<AccessPage />);

    await user.click(screen.getByRole("button", { name: "Novo acesso" }));
    const dialog = screen.getByRole("dialog", { name: "Novo acesso" });
    await user.type(
      within(dialog).getByLabelText("E-mail"),
      "colega@example.com",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Conceder acesso" }),
    );
    await waitFor(() => expect(grantAccess.mutate).toHaveBeenCalled());
    const [, options] = grantAccess.mutate.mock.calls[0] as [
      unknown,
      { onSuccess: (row: AccessRow) => void },
    ];

    options.onSuccess({ ...access[1], id: 3, email: "colega@example.com" });
    expect(
      await screen.findByText(/Acesso concedido a colega@example.com/),
    ).toBeInTheDocument();
    expect(screen.queryByText("E-mail não cadastrado")).not.toBeInTheDocument();
  });

  it("shows field errors returned by the API in the form", async () => {
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
    await waitFor(() => expect(grantAccess.mutate).toHaveBeenCalled());

    const [, options] = grantAccess.mutate.mock.calls[0] as [
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
