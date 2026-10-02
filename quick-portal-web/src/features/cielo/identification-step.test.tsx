import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { CieloPlanSummary } from "#features/cielo-plans/types";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { CieloIdentificationStep } from "./identification-step";
import { createIdentificationSchema } from "./schemas";

vi.mock("#hooks/quickApi/useCielo", () => ({
  useCieloOptions: () => ({ data: [] }),
}));

const business = { id: 73, document_type: "CNPJ" } as Business;

function plan(id: number, name: string): CieloPlanSummary {
  return {
    id,
    owner_business: 42,
    name,
    description: "",
    created_by: 1,
    created_at: "2026-09-01T10:00:00Z",
    archived_at: null,
    archived_by: null,
  };
}

function Form({ children }: { children: ReactNode }) {
  const methods = useForm({
    resolver: zodResolver(createIdentificationSchema("CNPJ")),
    defaultValues: {
      plan: "",
      contactName: "Contato",
      website: "",
      birthdayDate: "",
      businessActivityId: "",
    },
  });
  return (
    <FormProvider {...methods}>
      <form noValidate onSubmit={(event) => void methods.handleSubmit(() => undefined)(event)}>
        {children}
        <button type="submit">Continuar</button>
      </form>
    </FormProvider>
  );
}

describe("CieloIdentificationStep", () => {
  it("requires choosing one of the given active plans", async () => {
    const user = userEvent.setup();
    render(
      <Form>
        <CieloIdentificationStep
          business={business}
          plans={[plan(9, "Básico"), plan(11, "Premium")]}
        />
      </Form>,
    );

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      await screen.findByText("Selecione um plano Cielo"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: /Plano Cielo/ }));
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Básico",
      "Premium",
    ]);
    await user.click(options[1]);
    expect(screen.getByRole("combobox", { name: /Plano Cielo/ })).toHaveTextContent(
      "Premium",
    );
    expect(screen.queryByText("Selecione um plano Cielo")).not.toBeInTheDocument();
  });

  it("rejects an identification step without a plan", () => {
    const result = createIdentificationSchema("CNPJ").safeParse({
      plan: "",
      contactName: "Contato",
      website: "",
      birthdayDate: "",
      businessActivityId: "",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["plan"]]);
  });
});
