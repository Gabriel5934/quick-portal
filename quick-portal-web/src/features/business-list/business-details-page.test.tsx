import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ElementType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { useBusiness } from "#hooks/quickApi/useBusinesses";
import {
  useOwnBusinessForBusiness,
  type OwnBusinessDetails,
  type OwnRegistrationStatus,
} from "#hooks/quickApi/useOwnBusinesses";
import {
  useCieloBusiness,
  useRetryCieloBusiness,
} from "#hooks/quickApi/useCielo";
import type { CieloBusinessSummary } from "#features/cielo";
import type { CieloPlanSummary } from "#features/cielo-plans/types";
import { useCieloPlans } from "#hooks/quickApi/useCieloPlans";
import { BusinessDetails } from "./business-details-page";

vi.mock("@tanstack/react-router", () => {
  type MockLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    to: string;
    params?: { id: string };
  };
  const destination = (to: string, params?: { id: string }) =>
    params ? to.replace("$id", params.id) : to;

  return {
    Link: ({ children, to, params, ...props }: MockLinkProps) => (
      <a {...props} href={destination(to, params)}>
        {children}
      </a>
    ),
    createLink:
      (Component: ElementType) =>
      ({ children, to, params, ...props }: MockLinkProps) => (
        <Component {...props} href={destination(to, params)}>
          {children}
        </Component>
      ),
  };
});

vi.mock("#hooks/quickApi/useBusinesses", () => ({
  useBusiness: vi.fn(),
}));

vi.mock("#hooks/quickApi/useOwnBusinesses", () => ({
  useOwnBusinessForBusiness: vi.fn(),
}));

vi.mock("#hooks/quickApi/useCielo", () => ({
  useCieloBusiness: vi.fn(),
  useRetryCieloBusiness: vi.fn(),
  useCreateCieloBusiness: vi.fn(),
  useCieloOptions: vi.fn(),
}));

vi.mock("#hooks/quickApi/useCieloPlans", () => ({ useCieloPlans: vi.fn() }));

vi.mock("../../layout/business-context", () => ({
  useBusinessScope: () => ({
    business: { id: 42, type: "RESELLER", name: "Revenda", trade_name: "" },
  }),
}));

const activePlan: CieloPlanSummary = {
  id: 9,
  owner_business: 42,
  name: "Básico",
  description: "",
  created_by: 1,
  created_at: "2026-09-01T10:00:00Z",
  archived_at: null,
  archived_by: null,
};

function mockPlans(data: CieloPlanSummary[]) {
  vi.mocked(useCieloPlans).mockReturnValue({
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useCieloPlans>);
}

const business: Business = {
  id: 73,
  type: "STORE",
  parent: 42,
  document_type: "CNPJ",
  document: "12345678000195",
  name: "Mercado Central Ltda.",
  trade_name: "Mercado Central",
  email: "contato@mercado.test",
  phone: "11987654321",
  landline: "1133334444",
  color: "green",
};

const ownBusiness: OwnBusinessDetails = {
  id: 91,
  business: 73,
  cnae: 4814,
  plan: 18,
  signatory_name: "Maria Silva",
  signatory_cpf: "52998224725",
  signatory_email: "maria@example.com",
  forecast_revenue: "10000.00",
  contract_revenue: "8000.00",
  postal_code: "12244867",
  street: "Rua Milton Martins",
  address_number: "100A",
  address_complement: "Sala 1",
  neighborhood: "Urbanova",
  city: "São José dos Campos",
  state: "SP",
  pos_quantity: 2,
  bank_code: "001",
  bank_branch: "0123",
  bank_branch_digit: "4",
  bank_account: "00123456",
  bank_account_digit: "7",
  core_protocol: "PROTO-1",
  contract_number: "CONTRACT-1",
  registration_status: "REGISTERED",
  registration_error: "",
  created_at: "2026-09-15T10:00:00-03:00",
  updated_at: "2026-09-15T10:05:00-03:00",
};

const seller: CieloBusinessSummary = {
  id: 1,
  business: 73,
  status: "SENT",
  merchant_id: "f88cc14d-c796-4939-957e-de4dddcb2257",
  last_submitted_at: "2026-09-24T15:00:00Z",
  retry_available_at: null,
  can_retry: false,
  kyc_status: { value: 2, label: "Aprovado" },
  kyc_status_updated_at: "2026-09-25T10:00:00Z",
  bank_account_status: { value: 2, label: "Em processamento" },
  bank_account_status_updated_at: "2026-09-25T09:00:00Z",
  onboarding_status: { value: 1, label: "Em análise" },
  onboarding_status_updated_at: "2026-09-25T10:00:00Z",
};

const toneIcons = {
  success: ["CheckCircleOutlineOutlinedIcon", "MuiSvgIcon-colorSuccess"],
  warning: ["CheckCircleOutlineOutlinedIcon", "MuiSvgIcon-colorWarning"],
  pending: ["HourglassEmptyOutlinedIcon", "MuiSvgIcon-colorInfo"],
  action: ["ErrorOutlineOutlinedIcon", "MuiSvgIcon-colorWarning"],
  error: ["HighlightOffOutlinedIcon", "MuiSvgIcon-colorError"],
  neutral: ["HelpOutlineOutlinedIcon", "MuiSvgIcon-colorAction"],
} as const;

type Tone = keyof typeof toneIcons;

function mockSeller(data: CieloBusinessSummary | null) {
  vi.mocked(useCieloBusiness).mockReturnValue({
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useCieloBusiness>);
}

function mockOwnBusiness(data: OwnBusinessDetails | null) {
  vi.mocked(useOwnBusinessForBusiness).mockReturnValue({
    data,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useOwnBusinessForBusiness>);
}

function card(name: "OWN" | "Cielo") {
  return screen.getByRole("region", { name });
}

function badge(container: HTMLElement, caption: string) {
  return within(container).getByRole("status", {
    name: new RegExp(`^${caption}: `),
  });
}

function expectTone(element: HTMLElement, tone: Tone) {
  const [testId, colorClass] = toneIcons[tone];
  expect(within(element).getByTestId(testId)).toHaveClass(colorClass);
}

describe("BusinessDetails", () => {
  beforeEach(() => {
    mockSeller(null);
    mockPlans([activePlan]);
    vi.mocked(useRetryCieloBusiness).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useRetryCieloBusiness>);
    vi.mocked(useBusiness).mockReturnValue({
      data: business,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useBusiness>);
    vi.mocked(useOwnBusinessForBusiness).mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useOwnBusinessForBusiness>);
  });

  it("shows the Quick business table by default", () => {
    render(<BusinessDetails businessId={73} />);

    expect(useBusiness).toHaveBeenCalledWith(73);
    expect(useOwnBusinessForBusiness).toHaveBeenCalledWith(73);
    expect(within(card("OWN")).getByRole("status")).toHaveTextContent(
      "Não credenciado",
    );
    const table = screen.getByRole("table", {
      name: "Dados Quick do estabelecimento",
    });
    expect(
      within(table).getByText("Mercado Central Ltda."),
    ).toBeInTheDocument();
    expect(within(table).getByText("12.345.678/0001-95")).toBeInTheDocument();
    expect(within(table).getByText("(11) 98765-4321")).toBeInTheDocument();
  });

  it("shows OWN data when the business is already credentialed", async () => {
    vi.mocked(useOwnBusinessForBusiness).mockReturnValue({
      data: ownBusiness,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useOwnBusinessForBusiness>);
    const user = userEvent.setup();
    render(<BusinessDetails businessId={73} />);

    await user.click(screen.getByRole("tab", { name: "OWN" }));

    expect(useOwnBusinessForBusiness).toHaveBeenLastCalledWith(73);
    expect(within(card("OWN")).getByRole("status")).toHaveTextContent(
      "Credenciado",
    );
    const table = screen.getByRole("table", {
      name: "Dados OWN do estabelecimento",
    });
    expect(within(table).getByText("Credenciado")).toBeInTheDocument();
    expect(within(table).getByText("Maria Silva")).toBeInTheDocument();
    expect(within(table).getByText("PROTO-1")).toBeInTheDocument();
  });

  it("shows the OWN signup action when no OWN business exists", async () => {
    const user = userEvent.setup();
    render(<BusinessDetails businessId={73} />);

    await user.click(screen.getByRole("tab", { name: "OWN" }));

    expect(
      screen.getByText("Estabelecimento não credenciado na OWN"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Credenciar" })).toHaveAttribute(
      "href",
      "/business-list/73/credenciamento-own",
    );
  });

  it("offers review only for a failed OWN signup", () => {
    vi.mocked(useOwnBusinessForBusiness).mockReturnValue({
      data: {
        ...ownBusiness,
        registration_status: "API_REQUEST_FAILED",
        registration_error: "rejected",
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useOwnBusinessForBusiness>);

    render(<BusinessDetails businessId={73} />);

    expect(within(card("OWN")).getByRole("status")).toHaveTextContent(
      "Erro no cadastro",
    );
    expect(
      within(card("OWN")).getByRole("link", { name: "Revisar" }),
    ).toHaveAttribute("href", "/business-list/73/credenciamento-own");
  });

  it.each(["PENDING", "UNKNOWN", "REGISTERED"] as const)(
    "does not offer retry for %s",
    (registration_status) => {
      vi.mocked(useOwnBusinessForBusiness).mockReturnValue({
        data: { ...ownBusiness, registration_status },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useOwnBusinessForBusiness>);

      render(<BusinessDetails businessId={73} />);

      expect(
        within(card("OWN")).queryByRole("link", { name: "Revisar" }),
      ).toBeNull();
    },
  );

  it.each<[OwnRegistrationStatus | null, string, Tone]>([
    ["REGISTERED", "Credenciado", "success"],
    ["PENDING", "Pendente", "pending"],
    ["UNKNOWN", "Verificação necessária", "action"],
    ["API_REQUEST_FAILED", "Erro no cadastro", "error"],
    [null, "Não credenciado", "neutral"],
  ])(
    "renders the OWN %s status as one Credenciamento badge",
    (registrationStatus, label, tone) => {
      mockOwnBusiness(
        registrationStatus
          ? { ...ownBusiness, registration_status: registrationStatus }
          : null,
      );

      render(<BusinessDetails businessId={73} />);

      const ownCard = card("OWN");
      const [statusBadge] = within(ownCard).getAllByRole("status");
      expect(within(ownCard).getAllByRole("status")).toHaveLength(1);
      expect(statusBadge).toHaveAccessibleName(`Credenciamento: ${label}`);
      expectTone(statusBadge, tone);
      const review = within(ownCard).queryByRole("link", { name: "Revisar" });
      if (registrationStatus === "API_REQUEST_FAILED") {
        expect(review).toBeInTheDocument();
      } else {
        expect(review).toBeNull();
      }
    },
  );

  it("shows only the neutral Cielo badge and the signup action without a seller", async () => {
    const user = userEvent.setup();
    render(<BusinessDetails businessId={73} />);

    const cieloCard = card("Cielo");
    const statuses = within(cieloCard).getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveAccessibleName("Credenciamento: Não credenciado");
    expectTone(statuses[0], "neutral");
    expect(within(cieloCard).queryByText(/Última atualização/)).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Cielo" }));

    expect(screen.getByRole("link", { name: "Credenciar" })).toHaveAttribute(
      "href",
      "/business-list/73/credenciamento-cielo",
    );
  });

  it("disables Credenciar and links to a new plan without active plans", async () => {
    mockPlans([]);
    const user = userEvent.setup();
    render(<BusinessDetails businessId={73} />);

    await user.click(screen.getByRole("tab", { name: "Cielo" }));

    expect(useCieloPlans).toHaveBeenCalledWith(42);
    expect(screen.getByRole("button", { name: "Credenciar" })).toBeDisabled();
    expect(
      screen.queryByRole("link", { name: "Credenciar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Revenda não tem planos Cielo ativos/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Criar plano Cielo" }),
    ).toHaveAttribute("href", "/planos-cielo/novo");
  });

  it("renders the Cielo card below the OWN card with the API labels", () => {
    mockSeller(seller);
    render(<BusinessDetails businessId={73} />);

    const cieloCard = card("Cielo");
    expect(
      card("OWN").compareDocumentPosition(cieloCard) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(cieloCard)
        .getAllByRole("status")
        .map((element) => element.getAttribute("aria-label")),
    ).toEqual([
      "Quick: Enviado",
      "Credenciamento: Em análise",
      "Bancário: Em processamento",
      "KYC: Aprovado",
    ]);
  });

  it("shows Aguardando with the pending tone for statuses not received yet", () => {
    mockSeller({
      ...seller,
      kyc_status: null,
      kyc_status_updated_at: null,
    });
    render(<BusinessDetails businessId={73} />);

    const kyc = badge(card("Cielo"), "KYC");
    expect(kyc).toHaveAccessibleName("KYC: Aguardando");
    expectTone(kyc, "pending");
  });

  it.each<[string, Partial<CieloBusinessSummary>, Tone]>([
    ["Quick", { status: "SENT" }, "success"],
    ["KYC", { kyc_status: { value: 2, label: "Aprovado" } }, "success"],
    [
      "Bancário",
      { bank_account_status: { value: 3, label: "Sucesso" } },
      "success",
    ],
    [
      "Credenciamento",
      { onboarding_status: { value: 2, label: "Aprovado" } },
      "success",
    ],
    [
      "KYC",
      { kyc_status: { value: 3, label: "Aprovado com restrição" } },
      "warning",
    ],
    ["KYC", { kyc_status: { value: 1, label: "Em análise" } }, "pending"],
    [
      "Bancário",
      { bank_account_status: { value: 1, label: "Criado" } },
      "pending",
    ],
    [
      "Bancário",
      { bank_account_status: { value: 2, label: "Em processamento" } },
      "pending",
    ],
    [
      "Credenciamento",
      { onboarding_status: { value: 1, label: "Em análise" } },
      "pending",
    ],
    ["Quick", { status: "INTERVENTION_REQUIRED" }, "action"],
    [
      "Credenciamento",
      { onboarding_status: { value: 3, label: "Aguardando ação do lojista" } },
      "action",
    ],
    ["Quick", { status: "FAILED", can_retry: true }, "error"],
    ["KYC", { kyc_status: { value: 4, label: "Rejeitado" } }, "error"],
    [
      "Bancário",
      { bank_account_status: { value: 0, label: "Erro interno" } },
      "error",
    ],
    ["Bancário", { bank_account_status: { value: 4, label: "Erro" } }, "error"],
    [
      "Credenciamento",
      { onboarding_status: { value: 5, label: "Banido" } },
      "error",
    ],
    [
      "Credenciamento",
      { onboarding_status: { value: 4, label: "Desconhecido" } },
      "neutral",
    ],
  ])(
    "renders the %s badge for %o with the %s tone",
    (caption, changes, tone) => {
      mockSeller({ ...seller, ...changes });
      render(<BusinessDetails businessId={73} />);

      expectTone(badge(card("Cielo"), caption), tone);
    },
  );

  it("shows the API label for an unlisted status with the neutral tone", () => {
    mockSeller({
      ...seller,
      bank_account_status: { value: 9, label: "Desconhecido (9)" },
    });
    render(<BusinessDetails businessId={73} />);

    const bank = badge(card("Cielo"), "Bancário");
    expect(bank).toHaveAccessibleName("Bancário: Desconhecido (9)");
    expectTone(bank, "neutral");
  });

  it("shows the most recent Cielo timestamp as the last update", () => {
    mockSeller({
      ...seller,
      last_submitted_at: "2026-09-24T15:00:00Z",
      kyc_status_updated_at: "2026-09-25T10:00:00Z",
      bank_account_status_updated_at: "2026-09-26T08:30:00Z",
      onboarding_status_updated_at: "2026-09-25T11:00:00Z",
    });
    const { unmount } = render(<BusinessDetails businessId={73} />);

    expect(
      within(card("Cielo")).getByText(
        `Última atualização: ${new Date("2026-09-26T08:30:00Z").toLocaleString("pt-BR")}`,
      ),
    ).toBeInTheDocument();
    unmount();

    mockSeller({
      ...seller,
      last_submitted_at: null,
      kyc_status: null,
      kyc_status_updated_at: null,
      bank_account_status: null,
      bank_account_status_updated_at: null,
      onboarding_status: null,
      onboarding_status_updated_at: null,
    });
    render(<BusinessDetails businessId={73} />);

    expect(within(card("Cielo")).queryByText(/Última atualização/)).toBeNull();
  });

  it.each(["SENT", "INTERVENTION_REQUIRED"] as const)(
    "does not offer a Cielo retry for %s",
    (status) => {
      mockSeller({ ...seller, status });
      render(<BusinessDetails businessId={73} />);

      expect(
        within(card("Cielo")).queryByRole("button", {
          name: "Tentar novamente",
        }),
      ).toBeNull();
    },
  );

  it("offers a Cielo retry before the Quick badge for a failed seller", async () => {
    const mutate = vi.fn();
    vi.mocked(useRetryCieloBusiness).mockReturnValue({
      mutate,
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useRetryCieloBusiness>);
    mockSeller({ ...seller, status: "FAILED", can_retry: true });
    const user = userEvent.setup();
    render(<BusinessDetails businessId={73} />);

    const cieloCard = card("Cielo");
    const retry = within(cieloCard).getByRole("button", {
      name: "Tentar novamente",
    });
    expect(
      retry.compareDocumentPosition(badge(cieloCard, "Quick")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(retry);
    expect(mutate).toHaveBeenCalledWith({ businessId: 73 });
  });

  it("disables the Cielo retry during the cooldown and explains when it returns", async () => {
    const retryAvailableAt = "2026-09-24T15:05:00Z";
    mockSeller({
      ...seller,
      status: "FAILED",
      can_retry: false,
      retry_available_at: retryAvailableAt,
    });
    const user = userEvent.setup();
    render(<BusinessDetails businessId={73} />);

    const retry = within(card("Cielo")).getByRole("button", {
      name: "Tentar novamente",
    });
    expect(retry).toBeDisabled();
    await user.hover(retry.parentElement!);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      `Nova tentativa disponível em ${new Date(retryAvailableAt).toLocaleString("pt-BR")}`,
    );
  });

  it("shows the Cielo seller details in the Cielo tab", async () => {
    mockSeller(seller);
    const user = userEvent.setup();
    render(<BusinessDetails businessId={73} />);

    await user.click(screen.getByRole("tab", { name: "Cielo" }));

    const table = screen.getByRole("table", {
      name: "Dados Cielo do estabelecimento",
    });
    expect(
      within(table).getByRole("rowheader", { name: "Merchant ID" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByText("f88cc14d-c796-4939-957e-de4dddcb2257"),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("rowheader", { name: "Último envio" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByText(
        new Date("2026-09-24T15:00:00Z").toLocaleString("pt-BR"),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Credenciar" })).toBeNull();
  });

  it("shows an error for an invalid business id", () => {
    render(<BusinessDetails businessId={undefined} />);

    expect(
      screen.getByText("Identificador de estabelecimento inválido."),
    ).toBeInTheDocument();
  });
});
