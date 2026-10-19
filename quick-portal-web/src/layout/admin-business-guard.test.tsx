import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Business, BusinessRole } from "#hooks/quickApi/useBusinesses";
import { AdminBusinessGuard } from "./admin-business-guard";
import { BusinessScopeContext } from "./business-context";

vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to }: { to: string }) => <div>Redirected to {to}</div>,
}));

function renderGuard(role: BusinessRole | null) {
  const business = { id: 1, type: "STORE", parent: null, role } as Business;
  renderScope(business, false);
}

function renderScope(business: Business | null, isLoading: boolean) {
  render(
    <BusinessScopeContext value={{ business, isLoading }}>
      <AdminBusinessGuard>
        <div>Guarded page</div>
      </AdminBusinessGuard>
    </BusinessScopeContext>,
  );
}

describe("AdminBusinessGuard", () => {
  it.each<BusinessRole | null>(["MANAGER", "VIEWER", null])(
    "redirects %s members to Sales",
    (role) => {
      renderGuard(role);

      expect(screen.getByText("Redirected to /sales")).toBeInTheDocument();
      expect(screen.queryByText("Guarded page")).not.toBeInTheDocument();
    },
  );

  it("renders the page for admins", () => {
    renderGuard("ADMIN");

    expect(screen.getByText("Guarded page")).toBeInTheDocument();
  });

  it("shows a loading state while the businesses load", () => {
    renderScope(null, true);

    expect(screen.getByLabelText("Carregando empresa")).toBeInTheDocument();
    expect(screen.queryByText("Guarded page")).not.toBeInTheDocument();
  });

  it("asks for a business when none is selected", () => {
    renderScope(null, false);

    expect(screen.getByText("Selecione uma empresa.")).toBeInTheDocument();
    expect(screen.queryByText("Guarded page")).not.toBeInTheDocument();
  });
});
