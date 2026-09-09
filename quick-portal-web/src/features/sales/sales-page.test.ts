import { describe, expect, it } from "vitest";
import { generateSalesDashboard } from "./sales-data";

describe("generateSalesDashboard", () => {
  it("generates stable sales values for the same business name", () => {
    expect(generateSalesDashboard("Empresa Exemplo")).toEqual(
      generateSalesDashboard("Empresa Exemplo"),
    );
  });

  it("generates distinct sales values for different business names", () => {
    expect(generateSalesDashboard("Empresa A")).not.toEqual(
      generateSalesDashboard("Empresa B"),
    );
  });

  it("generates one sales point for every month", () => {
    expect(generateSalesDashboard("Empresa Exemplo").yearlySales).toHaveLength(
      12,
    );
  });
});
