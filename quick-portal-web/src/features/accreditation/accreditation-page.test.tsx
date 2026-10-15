import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ElementType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCieloBusiness,
  useRetryCieloBusiness,
} from "#hooks/quickApi/useCielo";
import type { CieloBusinessSummary } from "#features/cielo";
import type { CieloPlanSummary } from "#features/cielo-plans/types";
import { useCieloPlans } from "#hooks/quickApi/useCieloPlans";
import { AccreditationPage } from "./accreditation-page";

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

vi.mock("#hooks/quickApi/useCielo", () => ({
  useCieloBusiness: vi.fn(),
  useRetryCieloBusiness: vi.fn(),
  useCreateCieloBusiness: vi.fn(),
  useCieloOptions: vi.fn(),
}));

vi.mock("#hooks/quickApi/useCieloPlans", () => ({ useCieloPlans: vi.fn() }));

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

function card(name: "Cielo") {
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

describe("AccreditationPage", () => {
  beforeEach(() => {
    mockSeller(null);
    mockPlans([activePlan]);
    vi.mocked(useRetryCieloBusiness).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      error: null,
    } as unknown as ReturnType<typeof useRetryCieloBusiness>);
  });

  it("shows only the Cielo card, without tabs or OWN data", () => {
    render(<AccreditationPage businessId={73} />);

    expect(card("Cielo")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "OWN" })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers the Cielo signup without a seller", () => {
    render(<AccreditationPage businessId={73} />);

    const cieloCard = card("Cielo");
    const statuses = within(cieloCard).getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveAccessibleName("Credenciamento: Não credenciado");
    expectTone(statuses[0], "neutral");
    expect(within(cieloCard).queryByText(/Última atualização/)).toBeNull();
    expect(useCieloPlans).toHaveBeenCalledWith(73);
    expect(
      within(cieloCard).getByRole("link", { name: "Credenciar" }),
    ).toHaveAttribute("href", "/credenciamento/cielo");
    expect(
      within(cieloCard).queryByRole("link", { name: "Novo plano" }),
    ).toBeNull();
  });

  it("offers a new plan and disables the signup without active plans", () => {
    mockPlans([]);
    render(<AccreditationPage businessId={73} />);

    const cieloCard = card("Cielo");
    expect(
      within(cieloCard).getByRole("link", { name: "Novo plano" }),
    ).toHaveAttribute("href", "/planos-cielo/novo");
    expect(
      within(cieloCard).getByRole("button", { name: "Credenciar" }),
    ).toBeDisabled();
    expect(
      within(cieloCard).queryByRole("link", { name: "Credenciar" }),
    ).toBeNull();
  });

  it("offers no signup or new plan once the seller exists", () => {
    mockSeller(seller);
    mockPlans([]);
    render(<AccreditationPage businessId={73} />);

    const cieloCard = card("Cielo");
    expect(within(cieloCard).queryByText("Credenciar")).toBeNull();
    expect(within(cieloCard).queryByText("Novo plano")).toBeNull();
  });

  it("renders the Cielo card with the API labels", () => {
    mockSeller(seller);
    render(<AccreditationPage businessId={73} />);

    const cieloCard = card("Cielo");
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
    render(<AccreditationPage businessId={73} />);

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
      render(<AccreditationPage businessId={73} />);

      expectTone(badge(card("Cielo"), caption), tone);
    },
  );

  it("shows the API label for an unlisted status with the neutral tone", () => {
    mockSeller({
      ...seller,
      bank_account_status: { value: 9, label: "Desconhecido (9)" },
    });
    render(<AccreditationPage businessId={73} />);

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
    const { unmount } = render(<AccreditationPage businessId={73} />);

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
    render(<AccreditationPage businessId={73} />);

    expect(within(card("Cielo")).queryByText(/Última atualização/)).toBeNull();
  });

  it.each(["SENT", "INTERVENTION_REQUIRED"] as const)(
    "does not offer a Cielo retry for %s",
    (status) => {
      mockSeller({ ...seller, status });
      render(<AccreditationPage businessId={73} />);

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
    render(<AccreditationPage businessId={73} />);

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
    render(<AccreditationPage businessId={73} />);

    const retry = within(card("Cielo")).getByRole("button", {
      name: "Tentar novamente",
    });
    expect(retry).toBeDisabled();
    await user.hover(retry.parentElement!);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      `Nova tentativa disponível em ${new Date(retryAvailableAt).toLocaleString("pt-BR")}`,
    );
  });

  it("shows the Cielo seller details below the card", () => {
    mockSeller(seller);
    render(<AccreditationPage businessId={73} />);

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

  it("asks for a business when none is selected", () => {
    render(<AccreditationPage businessId={undefined} />);

    expect(screen.getByText("Selecione uma empresa.")).toBeInTheDocument();
  });
});
