import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CieloPlan } from "#features/cielo-plans/types";
import {
  CieloPlanRequestError,
  useCieloPlan,
  useCieloPlans,
  useCreateCieloPlan,
} from "./useCieloPlans";

vi.mock("#hooks/auth/useToken", () => ({
  useToken: () => ({ data: "access-token" }),
}));

const fetchMock = vi.fn();

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

const plan: CieloPlan = {
  id: 7,
  owner_business: 5,
  name: "Básico",
  description: "",
  created_by: 1,
  created_at: "2026-10-01T10:00:00Z",
  archived_at: null,
  archived_by: null,
  rates: [],
};

describe("Cielo plan hooks", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it.each([
    [{}, "/cielo/plans/?business=5"],
    [{ archived: true }, "/cielo/plans/?business=5&archived=true"],
  ])("loads the selected business plans with %o", async (options, path) => {
    fetchMock.mockResolvedValue(jsonResponse([plan]));

    const { result } = renderHook(() => useCieloPlans(5, options), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual([plan]));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`${path.replace(/[?]/g, "\\?")}$`)),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }) as unknown,
      }),
    );
  });

  it("does not load before a business is selected", () => {
    renderHook(() => useCieloPlans(undefined), { wrapper: Wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null for a plan the selected business does not own", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Not found." }, 404));

    const { result } = renderHook(() => useCieloPlan(9, 5), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates plans for the selected business and keeps field errors", async () => {
    const errors = { name: ["A plan with this name already exists."] };
    fetchMock.mockResolvedValue(jsonResponse(errors, 400));
    const { result } = renderHook(() => useCreateCieloPlan(5), {
      wrapper: Wrapper,
    });

    let error: unknown;
    await act(async () => {
      error = await result.current
        .mutateAsync({ name: "Básico", description: "", rates: [] })
        .catch((caught: unknown) => caught);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/cielo\/plans\/\?business=5$/),
      expect.objectContaining({ method: "POST" }),
    );
    expect(error).toBeInstanceOf(CieloPlanRequestError);
    expect((error as CieloPlanRequestError).body).toEqual(errors);
    expect((error as Error).message).toBe(errors.name[0]);
  });
});
