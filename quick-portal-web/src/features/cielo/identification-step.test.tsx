import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CieloIdentificationStep } from "./identification-step";
import type { CieloBusinessFormValues } from "./types";
import type { Business } from "#hooks/quickApi/useBusinesses";

vi.mock("#hooks/quickApi/useCielo", () => ({
  useCieloOptions: (path: string) => ({
    data: path === "business-activities" ? [] : [],
  }),
}));

const business: Business = {
  id: 73,
  type: "STORE",
  parent: null,
  document_type: "CNPJ",
  document: "12ABC34501DE36",
  name: "Seller Ltda",
  trade_name: "Seller",
  email: "seller@example.com",
  phone: "11987654321",
  landline: "",
  color: "blue",
};

function Harness() {
  const methods = useForm<CieloBusinessFormValues>({
    defaultValues: {
      contactName: "",
      website: "",
      birthdayDate: "",
      businessActivityId: "",
      corporateName: "",
      fancyName: "",
    } as CieloBusinessFormValues,
  });
  return (
    <QueryClientProvider client={new QueryClient()}>
      <FormProvider {...methods}>
        <CieloIdentificationStep business={business} />
      </FormProvider>
    </QueryClientProvider>
  );
}

describe("Cielo identification", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("does not call BrasilAPI for a mathematically invalid CNPJ", async () => {
    render(<Harness />);

    await waitFor(() =>
      expect(screen.getByText("CNPJ inválido")).toBeInTheDocument(),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
