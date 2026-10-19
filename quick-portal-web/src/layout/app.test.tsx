import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "./app";

const matchedRouteIds = vi.hoisted(() => ({ current: [] as string[] }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    to,
  }: {
    children: ReactNode;
    className?: string;
    to: string;
  }) => (
    <a className={className} href={to}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({
      matches: matchedRouteIds.current.map((routeId) => ({ routeId })),
    }),
}));

vi.mock("#hooks/auth/useLogout", () => ({ useLogout: () => vi.fn() }));
vi.mock("#hooks/storage", () => ({ getUserEmail: () => "user@example.com" }));
vi.mock("#hooks/quickApi/useBusinessAccess", () => ({
  useReceivedInvites: () => ({ data: [{ id: 1 }, { id: 2 }] }),
}));

function renderLayout() {
  render(
    <AppLayout>
      <div>Conteúdo</div>
    </AppLayout>,
  );
}

describe("AppLayout account drawer", () => {
  beforeEach(() => {
    matchedRouteIds.current = [];
  });

  it("lists Meus ECs before Novo estabelecimento and Convites", () => {
    renderLayout();

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/sales",
      "/novo-ec",
      "/convites",
    ]);
    expect(screen.getByRole("link", { name: /Convites/ })).toHaveTextContent(
      "2",
    );
  });

  it("marks Novo estabelecimento as current on the new business page", () => {
    matchedRouteIds.current = [
      "__root__",
      "/_authRoutes",
      "/_authRoutes/novo-ec",
    ];
    renderLayout();

    expect(
      screen.getByRole("link", { name: "Novo estabelecimento" }),
    ).toHaveClass("Mui-selected");
    expect(screen.getByRole("link", { name: "Meus ECs" })).not.toHaveClass(
      "Mui-selected",
    );
  });

  it("marks Meus ECs as current on any business page", () => {
    matchedRouteIds.current = [
      "__root__",
      "/_authRoutes",
      "/_authRoutes/_businessRoutes",
      "/_authRoutes/_businessRoutes/credenciamento",
    ];
    renderLayout();

    expect(screen.getByRole("link", { name: "Meus ECs" })).toHaveClass(
      "Mui-selected",
    );
    expect(
      screen.getByRole("link", { name: "Novo estabelecimento" }),
    ).not.toHaveClass("Mui-selected");
  });
});
