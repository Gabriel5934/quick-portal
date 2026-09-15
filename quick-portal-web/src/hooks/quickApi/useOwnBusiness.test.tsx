import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOwnBusiness } from "./useOwnBusiness";

vi.mock("#hooks/auth/useToken", () => ({
  useToken: () => ({ data: "access-token" }),
}));

const fetchMock = vi.fn();

const payload = {
  businessId: 73,
  bankCode: "001",
  branch: "0123",
  branchDigit: "4",
  account: "00123456",
  accountDigit: "7",
  postalCode: "12244-867",
  state: "SP",
  city: "São José dos Campos",
  neighborhood: "Urbanova",
  street: "Rua Milton Martins",
  number: "100A",
  complement: "Sala 1",
  planId: 18,
  signatoryName: "Maria Silva",
  signatoryCpf: "529.982.247-25",
  signatoryEmail: "maria@example.com",
  expectedRevenue: "R$ 10.000,00",
  commitedRevenue: "R$ 8.000,00",
  quantityPos: 2,
};

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useOwnBusiness", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("creates an OWN signup with the acquirer-specific payload", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useOwnBusiness(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(payload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/own/businesses/");
    expect(options).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer access-token",
      },
    });
    expect(typeof options.body).toBe("string");
    const requestBody = JSON.parse(options.body as string) as unknown;
    expect(requestBody).toEqual({
      business: 73,
      plan: 18,
      signatory_name: "Maria Silva",
      signatory_cpf: "52998224725",
      signatory_email: "maria@example.com",
      forecast_revenue: 10000,
      contract_revenue: 8000,
      postal_code: "12244867",
      address_number: "100A",
      address_complement: "Sala 1",
      pos_quantity: 2,
      bank_code: "001",
      bank_branch: "0123",
      bank_branch_digit: "4",
      bank_account: "00123456",
      bank_account_digit: "7",
    });
  });

  it("shows the detail returned by an OWN registration failure", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ detail: "Credenciamento recusado." }),
    });
    const { result } = renderHook(() => useOwnBusiness(), {
      wrapper: Wrapper,
    });

    act(() => result.current.mutate(payload));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error("Credenciamento recusado."));
  });
});
