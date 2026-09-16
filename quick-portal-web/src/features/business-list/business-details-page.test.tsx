import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ElementType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { useBusiness } from "#hooks/quickApi/useBusinesses";
import {
  useOwnBusinessForBusiness,
  type OwnBusinessDetails,
} from "#hooks/quickApi/useOwnBusinesses";
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

describe("BusinessDetails", () => {
  beforeEach(() => {
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
    expect(useOwnBusinessForBusiness).toHaveBeenCalledWith(73, false);
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

    expect(useOwnBusinessForBusiness).toHaveBeenLastCalledWith(73, true);
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

  it("shows the unavailable state in the Cielo tab", async () => {
    const user = userEvent.setup();
    render(<BusinessDetails businessId={73} />);

    await user.click(screen.getByRole("tab", { name: "Cielo" }));

    expect(
      screen.getByText("Cielo ainda não está disponível"),
    ).toBeInTheDocument();
  });

  it("shows an error for an invalid business id", () => {
    render(<BusinessDetails businessId={undefined} />);

    expect(
      screen.getByText("Identificador de estabelecimento inválido."),
    ).toBeInTheDocument();
  });
});
