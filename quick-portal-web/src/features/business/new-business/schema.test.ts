import { describe, expect, it } from "vitest";
import { newBusinessSchema } from "./schema";
import { isValidCnpj, isValidCpf, normalizeCnpj } from "../document";

const validBusiness = {
  isReseller: false,
  name: "Gabriel Andrade",
  nomeFantasia: "",
  email: "gabriel@example.com",
  celular: "(11) 98765-4321",
  telefone: "",
};

describe("new business schema", () => {
  it("accepts a CPF registration without a CNAE", () => {
    const result = newBusinessSchema.safeParse({
      ...validBusiness,
      documentType: "CPF",
      document: "529.982.247-25",
    });

    expect(result.success).toBe(true);
  });

  it("validates CPF check digits", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("52998224726")).toBe(false);
    expect(
      newBusinessSchema.safeParse({
        ...validBusiness,
        documentType: "CPF",
        document: "529.982.247-26",
      }).success,
    ).toBe(false);
  });

  it("validates numeric and alphanumeric CNPJ check digits", () => {
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("12ABC34501DE35")).toBe(true);
    expect(isValidCnpj("12ABC34501DE36")).toBe(false);
    expect(normalizeCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");

    expect(
      newBusinessSchema.safeParse({
        ...validBusiness,
        documentType: "CNPJ",
        document: "12.ABC.345/01DE-35",
      }).success,
    ).toBe(true);
  });
});
