import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { useAllBusinesses } from "#hooks/quickApi/useBusinesses";
import { BusinessLayout } from "./business-layout";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => children,
  useNavigate: () => navigate,
}));

vi.mock("#hooks/quickApi/useBusinesses", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("#hooks/quickApi/useBusinesses")>();
  return { ...original, useAllBusinesses: vi.fn() };
});

function business(
  id: number,
  name: string,
  type: Business["type"],
  parent: number | null,
): Business {
  return {
    id,
    name,
    type,
    parent,
    document_type: "CNPJ",
    document: String(id).padStart(14, "0"),
    trade_name: "",
    cnae: null,
    email: `${id}@example.com`,
    phone: "11999999999",
    landline: "",
    status: "NOT_STARTED",
  };
}

const hierarchy = [
  business(1, "Primeira revenda", "RESELLER", null),
  business(2, "Segunda revenda", "RESELLER", null),
  business(3, "Primeira revenda filha", "RE_RESELLER", 1),
  business(4, "Segunda revenda filha", "RE_RESELLER", 1),
  business(5, "Primeiro estabelecimento", "STORE", 3),
  business(6, "Segundo estabelecimento", "STORE", 3),
];

function renderHierarchy(businesses: Business[]) {
  vi.mocked(useAllBusinesses).mockReturnValue({
    data: businesses,
    isLoading: false,
  } as ReturnType<typeof useAllBusinesses>);

  render(
    <BusinessLayout>
      <div>Conteúdo</div>
    </BusinessLayout>,
  );
}

const highestLevelScenarios = [
  {
    level: "an establishment",
    businesses: [
      business(1, "Primeiro estabelecimento", "STORE", 100),
      business(2, "Segundo estabelecimento", "STORE", 200),
    ],
    expected: "Primeiro estabelecimento",
  },
  {
    level: "a re-reseller",
    businesses: [
      business(1, "Primeira revenda filha", "RE_RESELLER", 100),
      business(2, "Segunda revenda filha", "RE_RESELLER", 200),
      business(3, "Estabelecimento filho", "STORE", 1),
    ],
    expected: "Primeira revenda filha",
  },
  {
    level: "a reseller",
    businesses: [
      business(1, "Primeira revenda", "RESELLER", null),
      business(2, "Segunda revenda", "RESELLER", null),
      business(3, "Revenda filha", "RE_RESELLER", 1),
    ],
    expected: "Primeira revenda",
  },
];

describe("BusinessLayout business selector", () => {
  beforeEach(() => navigate.mockClear());

  it.each(highestLevelScenarios)(
    "selects the first highest-level business when it is $level",
    ({ businesses, expected }) => {
      renderHierarchy(businesses);

      expect(screen.getByRole("combobox")).toHaveValue(expected);
    },
  );

  it("groups stores as establishments and both reseller types as resellers", async () => {
    renderHierarchy(hierarchy);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));

    expect(screen.getByText("Estabelecimento")).toBeInTheDocument();
    expect(screen.getByText("Revenda")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Primeira revenda" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Primeira revenda filha" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Primeiro estabelecimento" }),
    ).toBeInTheDocument();
  });

  it("redirects to Sales when the selected business changes", async () => {
    renderHierarchy(hierarchy);
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Segunda revenda" }));

    expect(navigate).toHaveBeenCalledWith({ to: "/sales" });
  });

  it("only shows Sales in the guarded navigation when a store is selected", () => {
    renderHierarchy([business(1, "Estabelecimento", "STORE", null)]);

    expect(screen.getByText("Vendas")).toBeInTheDocument();
    expect(screen.queryByText("Estabelecimentos")).not.toBeInTheDocument();
    expect(screen.queryByText("Credenciamento")).not.toBeInTheDocument();
    expect(screen.queryByText("Planos e Taxas")).not.toBeInTheDocument();
  });
});
