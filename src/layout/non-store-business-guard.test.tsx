import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { BusinessScopeContext } from "./business-context";
import { NonStoreBusinessGuard } from "./non-store-business-guard";

vi.mock("@tanstack/react-router", () => ({
  Navigate: ({ to }: { to: string }) => <div>Redirected to {to}</div>,
}));

const selectedBusiness = {
  id: 1,
  type: "STORE",
  parent: null,
} as Business;

describe("NonStoreBusinessGuard", () => {
  it("redirects store profiles to Sales", () => {
    render(
      <BusinessScopeContext value={{ business: selectedBusiness }}>
        <NonStoreBusinessGuard>
          <div>Guarded page</div>
        </NonStoreBusinessGuard>
      </BusinessScopeContext>,
    );

    expect(screen.getByText("Redirected to /sales")).toBeInTheDocument();
    expect(screen.queryByText("Guarded page")).not.toBeInTheDocument();
  });
});
