import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ElementType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CieloBusinessPage } from "./cielo-business-page";
import type { CieloBusinessSummary } from "./types";
import type { CieloPlanSummary } from "#features/cielo-plans/types";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { useCieloPlans } from "#hooks/quickApi/useCieloPlans";

const { navigate, mutateAsync } = vi.hoisted(() => ({
  navigate: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  createLink:
    (Component: ElementType) =>
    ({
      children,
      to,
      ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & {
      children: ReactNode;
      to: string;
    }) => (
      <Component {...props} href={to}>
        {children}
      </Component>
    ),
}));

vi.mock("#hooks/quickApi/useCieloPlans", () => ({ useCieloPlans: vi.fn() }));

const reseller = {
  id: 42,
  type: "RESELLER",
  name: "Revenda Ltda",
  trade_name: "Revenda",
} as Business;
vi.mock("../../layout/business-context", () => ({
  useBusinessScope: () => ({ business: reseller }),
}));

const activePlans: CieloPlanSummary[] = [
  {
    id: 9,
    owner_business: 42,
    name: "Básico",
    description: "",
    created_by: 1,
    created_at: "2026-09-01T10:00:00Z",
    archived_at: null,
    archived_by: null,
  },
];

function mockPlans(data: CieloPlanSummary[]) {
  vi.mocked(useCieloPlans).mockReturnValue({
    data,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useCieloPlans>);
}

vi.mock("#hooks/quickApi/useCielo", () => ({
  useCreateCieloBusiness: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("#hooks/brasilApi/useCep", () => ({
  CepValidationError: class CepValidationError extends Error {},
  useCep: () => ({
    data: undefined,
    error: null,
    isFetching: false,
  }),
}));

const business: Business = {
  id: 73,
  type: "STORE",
  parent: null,
  document_type: "CNPJ",
  document: "12ABC34501DE35",
  name: "Seller Ltda",
  trade_name: "Seller",
  email: "seller@example.com",
  phone: "11987654321",
  landline: "",
  color: "blue",
};

vi.mock("#hooks/quickApi/useBusinesses", () => ({
  useBusiness: () => ({ data: business, isPending: false, isError: false }),
}));

vi.mock("./schemas", async () => {
  const { z } = await import("zod");
  const acceptingStep = { safeParse: () => ({ success: true }) };
  return {
    createCieloBusinessSchema: () => z.any(),
    createIdentificationSchema: () => acceptingStep,
    addressSchema: acceptingStep,
    bankAccountSchema: acceptingStep,
  };
});

vi.mock("./identification-step", () => ({
  CieloIdentificationStep: ({ plans }: { plans: CieloPlanSummary[] }) => (
    <div>
      Identificação: {plans.map((plan) => plan.name).join(", ")}
    </div>
  ),
}));
vi.mock("./address-step", () => ({
  CieloAddressStep: () => <div>Endereço</div>,
}));
vi.mock("./bank-account-step", () => ({
  CieloBankAccountStep: () => <div>Conta bancária</div>,
}));
vi.mock("./review-step", () => ({
  CieloReviewStep: () => <div>Revisão do payload</div>,
}));
vi.mock("../../components/multi-step-form", () => ({
  MultiStepFormShell: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  WizardActions: ({
    onBack,
    submitLabel,
  }: {
    onBack?: () => void;
    submitLabel: string;
  }) => (
    <>
      {onBack ? (
        <button type="button" onClick={onBack}>
          Voltar
        </button>
      ) : null}
      <button type="submit">{submitLabel}</button>
    </>
  ),
}));

function persisted(
  status: CieloBusinessSummary["status"],
): CieloBusinessSummary {
  return {
    id: 1,
    business: 73,
    status,
    merchant_id:
      status === "SENT" ? "f88cc14d-c796-4939-957e-de4dddcb2257" : null,
    last_submitted_at: "2026-09-24T15:00:00Z",
    retry_available_at: status === "FAILED" ? "2026-09-24T15:05:00Z" : null,
    can_retry: false,
    kyc_status: null,
    kyc_status_updated_at: null,
    bank_account_status: null,
    bank_account_status_updated_at: null,
    onboarding_status: null,
    onboarding_status_updated_at: null,
  };
}

async function reachReviewAndSubmit() {
  const user = userEvent.setup();
  render(<CieloBusinessPage businessId={73} />);
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.click(screen.getByRole("button", { name: "Enviar à Cielo" }));
}

describe("Cielo submission result UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigate.mockResolvedValue(undefined);
    mockPlans(activePlans);
  });

  it("offers only the active plans of the business selected in the drawer", () => {
    render(<CieloBusinessPage businessId={73} />);

    expect(useCieloPlans).toHaveBeenCalledWith(42);
    expect(screen.getByText("Identificação: Básico")).toBeInTheDocument();
  });

  it("shows the create-a-plan message instead of the form without active plans", () => {
    mockPlans([]);
    render(<CieloBusinessPage businessId={73} />);

    expect(
      screen.getByText(/Revenda não tem planos Cielo ativos/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Criar plano Cielo" }),
    ).toHaveAttribute("href", "/planos-cielo/novo");
    expect(screen.queryByText(/^Identificação/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continuar" }),
    ).not.toBeInTheDocument();
  });

  it("sends the seller with the selected business as the plan scope", async () => {
    mutateAsync.mockResolvedValue(persisted("SENT"));

    await reachReviewAndSubmit();

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 73, scopeBusinessId: 42 }),
      ),
    );
  });

  it("keeps Quick-side failures on the review step and displays the retry message", async () => {
    mutateAsync.mockRejectedValue(new Error("Configuração Cielo ausente"));

    await reachReviewAndSubmit();

    expect(
      await screen.findByText("Tente novamente mais tarde"),
    ).toBeInTheDocument();
    expect(screen.getByText("Revisão do payload")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows appropriate error message when Quick cannot be reached", async () => {
    mutateAsync.mockRejectedValue(new TypeError("Failed to fetch"));

    await reachReviewAndSubmit();

    expect(
      await screen.findByText("Tente novamente mais tarde"),
    ).toBeInTheDocument();
    expect(screen.getByText("Revisão do payload")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(["FAILED", "INTERVENTION_REQUIRED", "SENT"] as const)(
    "redirects persisted %s outcomes to the Cielo details tab",
    async (status) => {
      mutateAsync.mockResolvedValue(persisted(status));

      await reachReviewAndSubmit();

      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith({
          to: "/business-list/$id",
          params: { id: "73" },
          search: { tab: "cielo" },
        }),
      );
    },
  );
});
