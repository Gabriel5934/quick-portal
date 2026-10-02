import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ElementType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { useCieloPlans } from "#hooks/quickApi/useCieloPlans";
import { CieloPlansPage } from "./cielo-plans-page";
import type { CieloPlanSummary } from "./types";

vi.mock("@tanstack/react-router", () => {
  type MockLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    to: string;
    params?: { id: string };
  };
  return {
    createLink:
      (Component: ElementType) =>
      ({ children, to, params, ...props }: MockLinkProps) => (
        <Component {...props} href={params ? to.replace("$id", params.id) : to}>
          {children}
        </Component>
      ),
  };
});

vi.mock("#hooks/quickApi/useCieloPlans", () => ({ useCieloPlans: vi.fn() }));

const reseller = { id: 5, type: "RESELLER", name: "Revenda" } as Business;
vi.mock("../../layout/business-context", () => ({
  useBusinessScope: () => ({ business: reseller }),
}));

function plan(
  id: number,
  name: string,
  changes: Partial<CieloPlanSummary> = {},
): CieloPlanSummary {
  return {
    id,
    owner_business: 5,
    name,
    description: "",
    created_by: 1,
    created_at: "2026-09-01T10:00:00Z",
    archived_at: null,
    archived_by: null,
    ...changes,
  };
}

// The API returns active plans newest first and archived plans most
// recently archived first; the page keeps that order.
const activePlans = [
  plan(3, "Novo", { description: "Plano mais recente" }),
  plan(1, "Antigo"),
];
const archivedPlans = [
  plan(4, "Arquivado recente", {
    archived_at: "2026-09-30T10:00:00Z",
    archived_by: 1,
  }),
  plan(2, "Arquivado antigo", {
    archived_at: "2026-09-10T10:00:00Z",
    archived_by: 1,
  }),
];

function rowNames(table: HTMLElement) {
  return within(table)
    .getAllByRole("link")
    .map((link) => [link.textContent, link.getAttribute("href")]);
}

describe("CieloPlansPage", () => {
  beforeEach(() => {
    vi.mocked(useCieloPlans).mockImplementation(
      (_businessId, options) =>
        ({
          data: options?.archived ? archivedPlans : activePlans,
          isLoading: false,
          error: null,
        }) as unknown as ReturnType<typeof useCieloPlans>,
    );
  });

  it("lists the selected business's active plans and links each one", () => {
    render(<CieloPlansPage />);

    expect(useCieloPlans).toHaveBeenCalledWith(5);
    expect(useCieloPlans).toHaveBeenCalledWith(5, { archived: true });
    const table = screen.getByRole("table", { name: "Planos ativos" });
    expect(rowNames(table)).toEqual([
      ["Novo", "/planos-cielo/3"],
      ["Antigo", "/planos-cielo/1"],
    ]);
    expect(within(table).getByText("Plano mais recente")).toBeInTheDocument();
  });

  it("keeps archived plans in a second table that is collapsed by default", async () => {
    const user = userEvent.setup();
    render(<CieloPlansPage />);

    expect(
      screen.queryByRole("table", { name: "Planos arquivados" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Planos arquivados (2)" }),
    );

    const table = await screen.findByRole("table", {
      name: "Planos arquivados",
    });
    expect(rowNames(table)).toEqual([
      ["Arquivado recente", "/planos-cielo/4"],
      ["Arquivado antigo", "/planos-cielo/2"],
    ]);
    expect(within(table).getByText("Arquivado em")).toBeInTheDocument();
  });
});
