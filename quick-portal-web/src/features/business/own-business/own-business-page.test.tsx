import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useOwnBusiness,
  useRetryOwnBusiness,
  useUpdateOwnBusiness,
} from "#hooks/quickApi/useOwnBusiness";
import {
  useOwnBusinessForBusiness,
  type OwnBusinessDetails,
} from "#hooks/quickApi/useOwnBusinesses";
import { OwnBusiness } from "./own-business-page";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  createLink:
    () =>
    ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("#hooks/quickApi/useOwnBusiness", () => ({
  useOwnBusiness: vi.fn(),
  useUpdateOwnBusiness: vi.fn(),
  useRetryOwnBusiness: vi.fn(),
}));

vi.mock("#hooks/quickApi/useOwnBusinesses", () => ({
  useOwnBusinessForBusiness: vi.fn(),
}));

vi.mock("#hooks/brasilApi/useBanks", () => ({
  useBanks: () => ({ data: [{ code: "001", name: "Banco Teste" }] }),
}));

vi.mock("#hooks/brasilApi/useCep", () => ({
  useCep: () => ({ data: undefined, error: null }),
  CepValidationError: class extends Error {},
}));

vi.mock("#hooks/quickApi/useOwnPlans", () => ({
  useOwnPlans: () => ({ data: [{ id: 18, title: "Plano Teste" }] }),
}));

vi.mock("../../../components/multi-step-form", () => ({
  MultiStepFormShell: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  FormFieldPaper: ({ children }: { children: ReactNode }) => (
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
      {onBack && (
        <button type="button" onClick={onBack}>
          Voltar
        </button>
      )}
      <button type="submit">{submitLabel}</button>
    </>
  ),
}));

const failedSignup: OwnBusinessDetails = {
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
  core_protocol: "",
  contract_number: "",
  registration_status: "API_REQUEST_FAILED",
  registration_error: "rejected",
  created_at: "2026-09-15T10:00:00-03:00",
  updated_at: "2026-09-15T10:05:00-03:00",
};

describe("OwnBusiness", () => {
  const create = vi.fn();
  const update = vi.fn();
  const retry = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue(failedSignup);
    update.mockResolvedValue(failedSignup);
    retry.mockResolvedValue(failedSignup);
    navigate.mockResolvedValue(undefined);
    vi.mocked(useOwnBusiness).mockReturnValue({
      mutateAsync: create,
      isPending: false,
    } as unknown as ReturnType<typeof useOwnBusiness>);
    vi.mocked(useUpdateOwnBusiness).mockReturnValue({
      mutateAsync: update,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateOwnBusiness>);
    vi.mocked(useRetryOwnBusiness).mockReturnValue({
      mutateAsync: retry,
      isPending: false,
    } as unknown as ReturnType<typeof useRetryOwnBusiness>);
    vi.mocked(useOwnBusinessForBusiness).mockReturnValue({
      data: failedSignup,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useOwnBusinessForBusiness>);
  });

  it("opens business details after retry even when OWN rejects the signup again", async () => {
    const user = userEvent.setup();
    render(<OwnBusiness businessId={73} />);

    const account = screen.getByRole("textbox", { name: "Número da conta" });
    expect(account).toHaveValue("00123456");
    await user.clear(account);
    await user.type(account, "99999999");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Reenviar à OWN" }));

    await waitFor(() => expect(retry).toHaveBeenCalledOnce());
    expect(update).toHaveBeenCalledOnce();
    const updateRequest = update.mock.calls[0][0] as {
      id: number;
      businessId: number;
      values: { account: string };
      changedFields: string[];
    };
    expect(updateRequest.id).toBe(91);
    expect(updateRequest.businessId).toBe(73);
    expect(updateRequest.values.account).toBe("99999999");
    expect(updateRequest.changedFields).toContain("account");
    expect(create).not.toHaveBeenCalled();
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(
      retry.mock.invocationCallOrder[0],
    );
    expect(navigate).toHaveBeenCalledWith({
      to: "/business-list/$id",
      params: { id: "73" },
    });
  });

  it.each(["PENDING", "UNKNOWN", "REGISTERED"] as const)(
    "does not allow editing a %s signup",
    (registration_status) => {
      vi.mocked(useOwnBusinessForBusiness).mockReturnValue({
        data: { ...failedSignup, registration_status },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useOwnBusinessForBusiness>);

      render(<OwnBusiness businessId={73} />);

      expect(screen.getByText(/não pode ser reenviado/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
    },
  );
});
