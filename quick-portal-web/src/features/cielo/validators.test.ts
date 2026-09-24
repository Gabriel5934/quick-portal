import { describe, expect, it } from "vitest";
import { isValidCnpj, isValidCpf, normalizeCnpj } from "./validators";

describe("Cielo document validation", () => {
  it("validates CPF check digits", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("52998224726")).toBe(false);
  });

  it("validates numeric and alphanumeric CNPJ check digits", () => {
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("12ABC34501DE35")).toBe(true);
    expect(isValidCnpj("12ABC34501DE36")).toBe(false);
    expect(normalizeCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
  });
});
