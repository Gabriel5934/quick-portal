import { render, screen } from "@testing-library/react";
import { CurrencyField } from "./currency-field";

describe("CurrencyField", () => {
  it("formats values as Brazilian reais with two decimal places", () => {
    render(
      <CurrencyField label="Valor" value="1234.5" onChange={() => undefined} />,
    );

    expect(screen.getByLabelText("Valor")).toHaveValue("R$ 1.234,50");
  });
});
