import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegistrationStep } from "./registration-step";
import type { NewBusinessFormValues } from "./types";

vi.mock("../../../layout/business-context", () => ({
  useBusinessScope: () => ({ business: null }),
}));

function Harness({ document }: { document: string }) {
  const methods = useForm<NewBusinessFormValues>({
    defaultValues: {
      isReseller: false,
      documentType: "CNPJ",
      document,
      name: "",
      nomeFantasia: "",
      email: "",
      celular: "",
      telefone: "",
    },
  });
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FormProvider {...methods}>
        <RegistrationStep />
      </FormProvider>
    </QueryClientProvider>
  );
}

describe("business registration document lookup", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("does not call BrasilAPI for a mathematically invalid CNPJ", async () => {
    render(<Harness document="12.ABC.345/01DE-36" />);

    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  });
});
