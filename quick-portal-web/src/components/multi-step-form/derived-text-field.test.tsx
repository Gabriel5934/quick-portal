import { render, screen } from "@testing-library/react";
import { DerivedTextField } from "./derived-text-field";

describe("DerivedTextField", () => {
  it("stays disabled and shows an indicator while loading", () => {
    render(<DerivedTextField label="Cidade" value="" loading />);

    expect(screen.getByLabelText("Cidade")).toBeDisabled();
    expect(
      screen.getByRole("status", { name: "Carregando dados" }),
    ).toBeInTheDocument();
  });

  it("hides the indicator after loading", () => {
    render(
      <DerivedTextField label="Cidade" value="São Paulo" loading={false} />,
    );

    expect(screen.getByLabelText("Cidade")).toHaveValue("São Paulo");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
