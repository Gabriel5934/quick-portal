import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOwnBusinessForBusiness } from "./useOwnBusinesses";

vi.mock("#hooks/auth/useToken", () => ({
  useToken: () => ({ data: "access-token" }),
}));

const fetchMock = vi.fn();

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useOwnBusinessForBusiness", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns the OWN record belonging to the selected business", async () => {
    const selectedOwnBusiness = { id: 91, business: 73 };
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([{ id: 90, business: 72 }, selectedOwnBusiness]),
    });

    const { result } = renderHook(() => useOwnBusinessForBusiness(73), {
      wrapper: Wrapper,
    });

    await waitFor(() =>
      expect(result.current.data).toEqual(selectedOwnBusiness),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/own/businesses/"),
      { headers: { Authorization: "Bearer access-token" } },
    );
  });

  it("returns null when the business has no OWN record", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: 90, business: 72 }]),
    });

    const { result } = renderHook(() => useOwnBusinessForBusiness(73), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeNull());
  });

  it("does not fetch until its tab is active", () => {
    renderHook(() => useOwnBusinessForBusiness(73, false), {
      wrapper: Wrapper,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
