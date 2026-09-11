import { describe, expect, it } from "vitest";
import { newBusinessSchema } from "./schema";

describe("new business schema", () => {
  it("accepts a CPF registration without a CNAE", () => {
    const result = newBusinessSchema.safeParse({
      isReseller: false,
      documentType: "CPF",
      document: "528.397.898-01",
      name: "Gabriel Andrade",
      nomeFantasia: "",
      email: "gabriel@example.com",
      celular: "(11) 98765-4321",
      telefone: "",
    });

    expect(result.success).toBe(true);
  });
});
