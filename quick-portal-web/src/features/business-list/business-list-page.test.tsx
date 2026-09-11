import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "#hooks/quickApi/useBusinesses";
import {
  useAllBusinesses,
  useBusinesses,
  useBusinessSummary,
} from "#hooks/quickApi/useBusinesses";
import { useAcquirers } from "#hooks/quickApi/useAcquirers";
import { BusinessScopeContext } from "../../layout/business-context";
import { BusinessList } from "./business-list-page";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("#hooks/quickApi/useBusinesses", () => ({
  useAllBusinesses: vi.fn(),
  useBusinesses: vi.fn(),
  useBusinessSummary: vi.fn(),
}));

vi.mock("#hooks/quickApi/useAcquirers", () => ({
  useAcquirers: vi.fn(),
}));

const selectedBusiness: Business = {
  id: 42,
  type: "RESELLER",
  parent: null,
  document_type: "CNPJ",
  document: "12345678000195",
  name: "Selected reseller",
  trade_name: "",
  email: "reseller@example.com",
  phone: "11999999999",
  landline: "",
  color: "blue",
};

describe("BusinessList summary", () => {
  beforeEach(() => {
    vi.mocked(useAllBusinesses).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useAllBusinesses>);
    vi.mocked(useBusinesses).mockReturnValue({
      data: {
        count: 0,
        next: null,
        previous: null,
        results: [],
      },
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useBusinesses>);
    vi.mocked(useBusinessSummary).mockReturnValue({
      data: {
        total: 11,
        not_started: 2,
        pending: 3,
        completed: 5,
        failed: 2,
      },
    } as ReturnType<typeof useBusinessSummary>);
    vi.mocked(useAcquirers).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useAcquirers>);
  });

  it("shows the parent-scoped acquirer summary", () => {
    render(
      <BusinessScopeContext value={{ business: selectedBusiness }}>
        <BusinessList />
      </BusinessScopeContext>,
    );

    expect(useBusinessSummary).toHaveBeenCalledWith(42);
    expect(
      within(screen.getByText("Total de ECs").parentElement!).getByText("11"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Não iniciados").parentElement!).getByText("2"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Pendentes").parentElement!).getByText("3"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Concluídos").parentElement!).getByText("5"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Falhos").parentElement!).getByText("2"),
    ).toBeInTheDocument();
  });
});
