import { randomInt, randomUUID } from "node:crypto";

import type {
  TransactionCard,
  TransactionPaymentType,
  TransactionResponse,
} from "./types.js";

const PAYMENT_TYPES: readonly TransactionPaymentType[] = [
  "CreditCard",
  "DebitCard",
  "Pix",
  "Boleto",
];

const BRANDS = ["Visa", "Master", "Elo"] as const;

// Statuses Cielo's status list allows for each payment type: Denied, Voided,
// and Refunded apply to cards only, and Scheduled to credit cards only.
const ALLOWED_STATUSES: Record<TransactionPaymentType, readonly number[]> = {
  CreditCard: [0, 1, 2, 3, 10, 11, 12, 13, 20],
  DebitCard: [0, 1, 2, 3, 10, 11, 12, 13],
  Pix: [0, 1, 2, 12, 13],
  Boleto: [0, 1, 2, 12, 13],
};

function pick<T>(values: readonly T[]): T {
  return values[randomInt(values.length)] as T;
}

/** The current São Paulo time as `YYYY-MM-DD HH:MM:SS`, like Cielo sends it. */
function saoPauloNow(): string {
  // The sv-SE locale formats dates as `YYYY-MM-DD HH:MM:SS`.
  return new Date().toLocaleString("sv-SE", {
    timeZone: "America/Sao_Paulo",
    hour12: false,
  });
}

function card(): TransactionCard {
  const lastDigits = String(randomInt(10_000)).padStart(4, "0");
  return {
    CardNumber: `455187******${lastDigits}`,
    Holder: "Teste Holder",
    ExpirationDate: `12/${new Date().getFullYear() + 3}`,
    Brand: pick(BRANDS),
  };
}

export function generateTransaction(merchantId: string): TransactionResponse {
  const type = pick(PAYMENT_TYPES);
  return {
    MerchantId: merchantId,
    MerchantOrderId: String(Date.now()),
    IsSplitted: false,
    Customer: {
      Name: "Comprador Teste",
      Identity: "52998224725",
      IdentityType: "CPF",
    },
    Payment: {
      PaymentId: randomUUID(),
      Type: type,
      Amount: randomInt(100, 500_000),
      ...(type === "CreditCard"
        ? { Installments: randomInt(1, 13), CreditCard: card() }
        : {}),
      ...(type === "DebitCard" ? { DebitCard: card() } : {}),
      ReceivedDate: saoPauloNow(),
      Currency: "BRL",
      Country: "BRA",
      Provider: "Cielo",
      Status: pick(ALLOWED_STATUSES[type]),
    },
  };
}

/** Changes the status to a different one allowed for the payment type. */
export function changeTransactionStatus(
  transaction: TransactionResponse,
): TransactionResponse {
  const current = transaction.Payment.Status;
  const allowed = ALLOWED_STATUSES[transaction.Payment.Type].filter(
    (status) => status !== current,
  );
  return {
    ...transaction,
    Payment: { ...transaction.Payment, Status: pick(allowed) },
  };
}
