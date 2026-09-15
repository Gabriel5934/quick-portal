import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { vi } from "vitest";
import type { OwnBusinessFormValues } from "./types";
import { AddressStep } from "./address-step";

vi.mock("#hooks/brasilApi/useCep", () => ({
  CepValidationError: class CepValidationError extends Error {},
  useCep: () => ({ data: undefined, error: null }),
}));

function AddressStepForm() {
  const methods = useForm<OwnBusinessFormValues>({
    defaultValues: {
      postalCode: "12244-867",
      state: "SP",
      city: "São José dos Campos",
      neighborhood: "Centro",
      street: "Rua Principal",
      number: "100",
      complement: "",
    },
  });

  return (
    <FormProvider {...methods}>
      <AddressStep />
    </FormProvider>
  );
}

describe("AddressStep", () => {
  it("groups the CEP-managed address fields and disables them", () => {
    render(<AddressStepForm />);

    const managedFields = ["Estado", "Cidade", "Bairro", "Rua"].map(
      (label) => screen.getByLabelText(new RegExp(`^${label}`)),
    );
    const addressPaper = screen.getByText("Endereço").closest(".MuiPaper-root");

    expect(addressPaper).not.toBeNull();
    managedFields.forEach((field) => {
      expect(field).toBeDisabled();
      expect(addressPaper).toContainElement(field);
    });
    expect(screen.getByLabelText(/^Número/)).toBeEnabled();
    expect(screen.getByLabelText("Complemento")).toBeEnabled();
  });
});
