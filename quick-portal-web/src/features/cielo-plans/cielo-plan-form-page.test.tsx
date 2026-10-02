import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "#hooks/quickApi/useBusinesses";
import {
  CieloPlanRequestError,
  useCieloPlan,
  useCreateCieloPlan,
} from "#hooks/quickApi/useCieloPlans";
import { NewCieloPlanPage } from "./cielo-plan-form-page";
import { CIELO_CARD_BRANDS, CIELO_RATE_ROWS } from "./rates";
import type { CieloPlan, CieloPlanCreateRequest } from "./types";

const { navigate, mutateAsync } = vi.hoisted(() => ({
  navigate: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

vi.mock("#hooks/quickApi/useCieloPlans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#hooks/quickApi/useCieloPlans")>()),
  useCieloPlan: vi.fn(),
  useCreateCieloPlan: vi.fn(),
}));

const reseller = { id: 5, type: "RESELLER", name: "Revenda" } as Business;
vi.mock("../../layout/business-context", () => ({
  useBusinessScope: () => ({ business: reseller }),
}));

// Each rate gets distinct values so a copy can be checked rate by rate.
const sourceRates = CIELO_CARD_BRANDS.flatMap((brand, brandIndex) =>
  CIELO_RATE_ROWS.map((row, rowIndex) => ({
    card_brand: brand,
    method: row.method,
    installments: row.installments,
    mdr: `${brandIndex + 1}.${String(rowIndex).padStart(2, "0")}`,
    fixed_fee: `0.${String(rowIndex + 10)}`,
  })),
);
const source: CieloPlan = {
  id: 7,
  owner_business: 5,
  name: "Básico",
  description: "Plano padrão da revenda",
  created_by: 1,
  created_at: "2026-09-01T10:00:00Z",
  archived_at: "2026-09-20T10:00:00Z",
  archived_by: 1,
  rates: [...sourceRates].reverse(),
};

function mockSource(data: CieloPlan | null | undefined) {
  vi.mocked(useCieloPlan).mockReturnValue({
    data,
    error: null,
  } as unknown as ReturnType<typeof useCieloPlan>);
}

function summary(brand: string) {
  return screen.getByRole("button", { name: new RegExp(`^${brand}`) });
}

function chip(brand: string) {
  return within(summary(brand)).getByLabelText(new RegExp(`^${brand}: `));
}

function renderForm(copyFromId?: number) {
  const user = userEvent.setup();
  render(<NewCieloPlanPage copyFromId={copyFromId} />);
  return user;
}

describe("NewCieloPlanPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigate.mockResolvedValue(undefined);
    mockSource(undefined);
    vi.mocked(useCreateCieloPlan).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateCieloPlan>);
  });

  it("prefills a copy with the description and all rates and an empty name", async () => {
    mockSource(source);
    mutateAsync.mockResolvedValue({ ...source, id: 8 });
    const user = renderForm(7);

    expect(useCieloPlan).toHaveBeenCalledWith(7, 5);
    expect(screen.getByRole("textbox", { name: "Nome" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Descrição" })).toHaveValue(
      "Plano padrão da revenda",
    );
    await user.click(summary("Elo"));
    expect(screen.getByLabelText("MDR Elo Crédito 3x")).toHaveValue("2,03");
    expect(screen.getByLabelText("Taxa fixa Elo Crédito 3x")).toHaveValue(
      "0,13",
    );

    await user.type(screen.getByRole("textbox", { name: "Nome" }), "Cópia");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
    const request = mutateAsync.mock.calls[0][0] as CieloPlanCreateRequest;
    expect(request).toEqual({
      name: "Cópia",
      description: "Plano padrão da revenda",
      rates: sourceRates,
    });
  });

  it("moves a chip from incomplete to complete or error after Concluir", async () => {
    mockSource(source);
    const user = renderForm(7);
    expect(chip("Visa")).toHaveTextContent("Incompleto");

    await user.click(summary("Visa"));
    await user.click(screen.getByRole("button", { name: "Concluir" }));

    await waitFor(() => expect(chip("Visa")).toHaveTextContent("Completo"));
    expect(summary("Visa")).toHaveAttribute("aria-expanded", "false");

    await user.click(summary("Elo"));
    await user.clear(screen.getByLabelText("MDR Elo Débito"));
    await user.click(screen.getByRole("button", { name: "Concluir" }));

    await waitFor(() => expect(chip("Elo")).toHaveTextContent("Com erros"));
    expect(summary("Elo")).toHaveAttribute("aria-expanded", "false");
    expect(chip("MasterCard")).toHaveTextContent("Incompleto");
  });

  it("expands only one accordion at a time", async () => {
    const user = renderForm();

    await user.click(summary("Visa"));
    expect(summary("Visa")).toHaveAttribute("aria-expanded", "true");

    await user.click(summary("MasterCard"));
    expect(summary("MasterCard")).toHaveAttribute("aria-expanded", "true");
    expect(summary("Visa")).toHaveAttribute("aria-expanded", "false");
    expect(summary("Elo")).toHaveAttribute("aria-expanded", "false");
  });

  it("validates every field on submit and expands the first brand with errors", async () => {
    const user = renderForm();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(chip("Visa")).toHaveTextContent("Com erros"));
    expect(chip("Elo")).toHaveTextContent("Com erros");
    expect(chip("MasterCard")).toHaveTextContent("Com erros");
    expect(summary("Visa")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Informe o nome do plano")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("stays on the form and maps backend field errors when saving fails", async () => {
    mockSource(source);
    const rateErrors = sourceRates.map(() => ({}));
    rateErrors[14] = { mdr: ["Ensure this value is less than or equal to 100."] };
    mutateAsync.mockRejectedValue(
      new CieloPlanRequestError(400, "A plan with this name already exists.", {
        name: ["A plan with this name already exists."],
        rates: rateErrors,
      }),
    );
    const user = renderForm(7);

    await user.type(screen.getByRole("textbox", { name: "Nome" }), "Básico");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText("A plan with this name already exists."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Não foi possível salvar o plano. Corrija os campos destacados."),
    ).toBeInTheDocument();
    // Request rate 14 is Elo's first row: the debit rate.
    expect(summary("Elo")).toHaveAttribute("aria-expanded", "true");
    expect(chip("Elo")).toHaveTextContent("Com erros");
    expect(chip("Visa")).toHaveTextContent("Completo");
    expect(
      screen.getByText("Ensure this value is less than or equal to 100."),
    ).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("redirects to the plan list after a successful submit", async () => {
    mockSource(source);
    mutateAsync.mockResolvedValue({ ...source, id: 8 });
    const user = renderForm(7);

    await user.type(screen.getByRole("textbox", { name: "Nome" }), "Novo");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/planos-cielo" }),
    );
  });
});
