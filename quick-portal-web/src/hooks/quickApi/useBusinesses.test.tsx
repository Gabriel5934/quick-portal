import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useBusinesses,
  useBusinessSummary,
  type Business,
} from "./useBusinesses";

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

describe("useBusinessSummary", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("loads the summary using only the selected parent", async () => {
    const summary = {
      total: 7,
      not_started: 2,
      pending: 1,
      completed: 3,
      failed: 2,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(summary),
    });

    const { result } = renderHook(() => useBusinessSummary(42), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(summary));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/businesses/summary/?parent=42"),
      { headers: { Authorization: "Bearer access-token" } },
    );
  });

  it("does not load before a business is selected", () => {
    renderHook(() => useBusinessSummary(undefined), { wrapper: Wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useBusinesses", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns the current business read shape", async () => {
    const business: Business = {
      id: 23,
      type: "RESELLER",
      parent: null,
      document_type: "CNPJ",
      document: "84644583000183",
      name: "Horizonte Distribuidora Recife Ltda.",
      trade_name: "Horizonte Serviços",
      email: "contato@example.com",
      phone: "51930874283",
      landline: "5130299735",
      color: "blue",
    };
    const response = {
      count: 1,
      next: null,
      previous: null,
      results: [business],
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response),
    });

    const { result } = renderHook(() => useBusinesses(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(response));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/businesses/"),
      { headers: { Authorization: "Bearer access-token" } },
    );
  });
});
