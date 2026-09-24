import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CieloBusinessPage } from "./cielo-business-page";
import type { CieloBusinessSummary } from "./types";
import type { Business } from "#hooks/quickApi/useBusinesses";

const { navigate, mutateAsync } = vi.hoisted(() => ({
  navigate: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

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
  CieloIdentificationStep: () => <div>Identificação</div>,
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
      status === "PENDING" ? "f88cc14d-c796-4939-957e-de4dddcb2257" : null,
    last_submitted_at: "2026-09-24T15:00:00Z",
    retry_available_at: status === "FAILED" ? "2026-09-24T15:05:00Z" : null,
    can_retry: false,
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

  it.each(["FAILED", "INTERVENTION_REQUIRED", "PENDING"] as const)(
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
