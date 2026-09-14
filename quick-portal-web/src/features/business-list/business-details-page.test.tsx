import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { useBusiness } from "#hooks/quickApi/useBusinesses";
import { BusinessDetails } from "./business-details-page";

vi.mock("@tanstack/react-router", () => ({
  Link: "a",
}));

vi.mock("#hooks/quickApi/useBusinesses", () => ({
  useBusiness: vi.fn(),
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

describe("BusinessDetails", () => {
  beforeEach(() => {
    vi.mocked(useBusiness).mockReturnValue({
      data: business,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useBusiness>);
  });

  it("loads and displays the selected business in a table", () => {
    render(<BusinessDetails businessId={73} />);

    expect(useBusiness).toHaveBeenCalledWith(73);
    const table = screen.getByRole("table", {
      name: "Detalhes do estabelecimento",
    });
    expect(
      within(table).getByText("Mercado Central Ltda."),
    ).toBeInTheDocument();
    expect(within(table).getByText("12.345.678/0001-95")).toBeInTheDocument();
    expect(within(table).getByText("(11) 98765-4321")).toBeInTheDocument();
  });

  it("shows an error for an invalid business id", () => {
    render(<BusinessDetails businessId={undefined} />);

    expect(
      screen.getByText("Identificador de estabelecimento inválido."),
    ).toBeInTheDocument();
  });
});
