import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { useCieloTransactions } from "#hooks/quickApi/useCieloTransactions";
import { Sales } from "./sales-page";
import type { CieloTransaction, CieloTransactionsResponse } from "./types";

vi.mock("#hooks/quickApi/useCieloTransactions", () => ({
  useCieloTransactions: vi.fn(),
}));

const store = { id: 7, type: "STORE", name: "Loja" } as Business;
vi.mock("../../layout/business-context", () => ({
  useBusinessScope: () => ({ business: store }),
}));

function transaction(
  id: number,
  changes: Partial<CieloTransaction> = {},
): CieloTransaction {
  return {
    id,
    payment_id: `507821c5-7067-49ff-928f-a3eb1e25614${id}`,
    received_date: "2026-10-01T15:30:00Z",
    amount: 123456,
    installments: 1,
    payment_type: { value: "CreditCard", label: "Crédito" },
    brand: "Visa",
    provider: "Simulado",
    status: { value: 2, label: "Pago" },
    ...changes,
  };
}

function mockTransactions(
  result: Partial<ReturnType<typeof useCieloTransactions>>,
) {
  vi.mocked(useCieloTransactions).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    ...result,
  } as unknown as ReturnType<typeof useCieloTransactions>);
}

function page(
  results: CieloTransaction[],
  count = results.length,
): CieloTransactionsResponse {
  return { count, next: null, previous: null, results };
}

function cellTexts(row: HTMLElement) {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
}

describe("Sales", () => {
  beforeEach(() => {
    vi.mocked(useCieloTransactions).mockReset();
  });

  it("renders each transaction in the six columns", () => {
    mockTransactions({
      data: page([
        transaction(1),
        transaction(2, {
          amount: 5000,
          brand: null,
          payment_type: { value: "Pix", label: "Pix" },
          provider: null,
          status: { value: 99, label: "Desconhecido (99)" },
        }),
      ]),
    });

    render(<Sales />);

    const table = screen.getByRole("table", { name: "Vendas" });
    const [header, first, second] = within(table).getAllByRole("row");
    expect(
      within(header)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Data", "Valor", "Bandeira", "Tipo", "Adquirente", "Status"]);
    const currency = (value: number) =>
      value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    expect(cellTexts(first)).toEqual([
      new Date("2026-10-01T15:30:00Z").toLocaleString("pt-BR"),
      currency(1234.56),
      "Visa",
      "Crédito",
      "Simulado",
      "Pago",
    ]);
    expect(cellTexts(second)).toEqual([
      new Date("2026-10-01T15:30:00Z").toLocaleString("pt-BR"),
      currency(50),
      "—",
      "Pix",
      "—",
      "Desconhecido (99)",
    ]);
  });

  it("requests the selected business and changes page", async () => {
    const user = userEvent.setup();
    const firstPage = page(
      Array.from({ length: 20 }, (_, index) => transaction(index + 1)),
      45,
    );
    mockTransactions({ data: firstPage });

    render(<Sales />);

    expect(useCieloTransactions).toHaveBeenLastCalledWith(7, {
      page: 1,
      pageSize: 20,
    });
    expect(screen.getByText("1–20 de 45")).toBeInTheDocument();

    // While page 2 loads, the query keeps page 1 as placeholder data.
    mockTransactions({ data: firstPage, isPlaceholderData: true });
    await user.click(screen.getByRole("button", { name: /próxima/i }));

    expect(useCieloTransactions).toHaveBeenLastCalledWith(7, {
      page: 2,
      pageSize: 20,
    });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Carregando vendas")).toBeInTheDocument();
  });

  it("shows the empty state when there are no transactions", () => {
    mockTransactions({ data: page([]) });

    render(<Sales />);

    const table = screen.getByRole("table", { name: "Vendas" });
    expect(
      within(table).getByText("Nenhuma venda encontrada"),
    ).toBeInTheDocument();
  });

  it("shows the error state when the request fails", () => {
    mockTransactions({ error: new Error("Erro ao carregar as vendas.") });

    render(<Sales />);

    expect(screen.getByText("Erro ao carregar as vendas.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
