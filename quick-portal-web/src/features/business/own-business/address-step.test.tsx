import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { vi } from "vitest";
import type { OwnBusinessFormValues } from "./types";
import { AddressStep } from "./address-step";

const { useCepMock } = vi.hoisted(() => ({ useCepMock: vi.fn() }));

vi.mock("#hooks/brasilApi/useCep", () => ({
  CepValidationError: class CepValidationError extends Error {},
  useCep: useCepMock,
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
  beforeEach(() => {
    useCepMock.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
    });
  });

  it("groups the CEP-managed address fields and disables them", () => {
    render(<AddressStepForm />);

    const managedFields = ["Estado", "Cidade", "Bairro", "Rua"].map((label) =>
      screen.getByLabelText(new RegExp(`^${label}`)),
    );
    const addressPaper = screen.getByText("Endereço").closest(".MuiPaper-root");

    expect(addressPaper).not.toBeNull();
    managedFields.forEach((field) => {
      expect(field).toBeDisabled();
      expect(addressPaper).toContainElement(field);
    });
    expect(screen.getByLabelText(/^Número/)).toBeEnabled();
    expect(screen.getByLabelText("Complemento")).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows loading indicators on every CEP-derived field while fetching", () => {
    useCepMock.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: true,
    });

    render(<AddressStepForm />);

    expect(
      screen.getAllByRole("status", { name: "Carregando dados" }),
    ).toHaveLength(4);
    ["Estado", "Cidade", "Bairro", "Rua"].forEach((label) => {
      expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeDisabled();
    });
  });
});
