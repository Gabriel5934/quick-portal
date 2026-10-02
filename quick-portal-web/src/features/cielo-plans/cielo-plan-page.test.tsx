import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ElementType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { CieloPlanPage } from "./cielo-plan-page";
import { CIELO_CARD_BRANDS, CIELO_RATE_ROWS } from "./rates";
import type { CieloPlan } from "./types";

vi.mock("@tanstack/react-router", () => {
  type MockLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    to: string;
    search?: Record<string, number>;
  };
  const destination = (to: string, search?: Record<string, number>) =>
    search ? `${to}?${new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)])).toString()}` : to;
  return {
    Link: ({ children, to, search, ...props }: MockLinkProps) => (
      <a {...props} href={destination(to, search)}>
        {children}
      </a>
    ),
    createLink:
      (Component: ElementType) =>
      ({ children, to, search, ...props }: MockLinkProps) => (
        <Component {...props} href={destination(to, search)}>
          {children}
        </Component>
      ),
  };
});

vi.mock("#hooks/auth/useToken", () => ({
  useToken: () => ({ data: "access-token" }),
}));

const reseller = { id: 5, type: "RESELLER", name: "Revenda" } as Business;
vi.mock("../../layout/business-context", () => ({
  useBusinessScope: () => ({ business: reseller }),
}));

const activePlan: CieloPlan = {
  id: 7,
  owner_business: 5,
  name: "Básico",
  description: "Plano padrão",
  created_by: 1,
  created_at: "2026-09-01T10:00:00Z",
  archived_at: null,
  archived_by: null,
  rates: CIELO_CARD_BRANDS.flatMap((brand) =>
    CIELO_RATE_ROWS.map((row) => ({
      card_brand: brand,
      method: row.method,
      installments: row.installments,
      mdr: "1.25",
      fixed_fee: "0.30",
    })),
  ),
};
const archivedPlan: CieloPlan = {
  ...activePlan,
  archived_at: "2026-10-01T10:00:00Z",
  archived_by: 1,
};

const fetchMock = vi.fn();

function respond(body: unknown, status = 200) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

function renderPage() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <CieloPlanPage planId={7} />
    </QueryClientProvider>,
  );
}

describe("CieloPlanPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows the plan and its rates read-only with a copy action", async () => {
    fetchMock.mockResolvedValue(respond(activePlan));
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Básico" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/cielo\/plans\/7\/\?business=5$/),
      expect.anything(),
    );
    expect(screen.getByText("Plano padrão")).toBeInTheDocument();
    expect(screen.getByText("Ativo")).toBeInTheDocument();
    expect(screen.getAllByText("1,25%")).toHaveLength(39);
    expect(screen.getAllByText("R$ 0,30")).toHaveLength(39);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Copiar" })).toHaveAttribute(
      "href",
      "/planos-cielo/novo?copiar=7",
    );
  });

  it("switches between Arquivar and Desarquivar and stays on the plan", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(respond(activePlan));
    renderPage();

    fetchMock.mockResolvedValue(respond(archivedPlan));
    await user.click(await screen.findByRole("button", { name: "Arquivar" }));

    expect(
      await screen.findByRole("button", { name: "Desarquivar" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Arquivado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Copiar" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/cielo\/plans\/7\/archive\/\?business=5$/),
      expect.objectContaining({ method: "POST" }),
    );

    fetchMock.mockResolvedValue(respond(activePlan));
    await user.click(screen.getByRole("button", { name: "Desarquivar" }));

    expect(
      await screen.findByRole("button", { name: "Arquivar" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ativo")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/cielo\/plans\/7\/unarchive\/\?business=5$/),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reports a plan the selected business does not own as not found", async () => {
    fetchMock.mockResolvedValue(respond({ detail: "Not found." }, 404));
    renderPage();

    expect(
      await screen.findByText(
        "Plano Cielo não encontrado para a empresa selecionada.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Arquivar" }),
    ).not.toBeInTheDocument();
  });
});
