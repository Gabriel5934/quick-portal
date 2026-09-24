const cpfPattern = /^\d{11}$/;
const cnpjPattern = /^[A-Z0-9]{12}\d{2}$/;
const cpfSeparators: Readonly<Record<number, string>> = {
  3: ".",
  6: ".",
  9: "-",
};
const cnpjSeparators: Readonly<Record<number, string>> = {
  2: ".",
  5: ".",
  8: "/",
  12: "-",
};

export type BusinessDocumentType = "CPF" | "CNPJ";

export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeCnpj(value: string): string {
  return value.replace(/[.\-/\s]/g, "").toUpperCase();
}

export function normalizeDocument(
  value: string,
  type: BusinessDocumentType,
): string {
  return type === "CPF" ? normalizeCpf(value) : normalizeCnpj(value);
}

export function formatDocument(
  value: string,
  type: BusinessDocumentType,
): string {
  const canonical = normalizeDocument(value, type)
    .replace(type === "CPF" ? /\D/g : /[^A-Z0-9]/g, "")
    .slice(0, type === "CPF" ? 11 : 14);
  const separators = type === "CPF" ? cpfSeparators : cnpjSeparators;

  return [...canonical].reduce(
    (masked, character, index) =>
      `${masked}${separators[index] ?? ""}${character}`,
    "",
  );
}

export function isValidCpf(value: string): boolean {
  const canonical = normalizeCpf(value);
  if (!cpfPattern.test(canonical) || new Set(canonical).size === 1) {
    return false;
  }

  const digits = [...canonical].map(Number);
  for (const length of [9, 10]) {
    const total = digits
      .slice(0, length)
      .reduce((sum, digit, index) => sum + digit * (length + 1 - index), 0);
    const checkDigit = ((total * 10) % 11) % 10;
    if (digits[length] !== checkDigit) return false;
  }
  return true;
}

function cnpjCheckDigit(characters: string, weights: readonly number[]) {
  const total = [...characters].reduce(
    (sum, character, index) =>
      sum + (character.charCodeAt(0) - 48) * weights[index],
    0,
  );
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(value: string): boolean {
  const canonical = normalizeCnpj(value);
  if (!cnpjPattern.test(canonical)) return false;
  if (/^\d+$/.test(canonical) && new Set(canonical).size === 1) return false;

  const base = canonical.slice(0, 12);
  const firstDigit = cnpjCheckDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = cnpjCheckDigit(
    `${base}${firstDigit}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return canonical.slice(-2) === `${firstDigit}${secondDigit}`;
}
