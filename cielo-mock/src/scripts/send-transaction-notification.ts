import { parseArgs } from "node:util";

import {
  databaseFile,
  transactionMerchantId,
  transactionNotificationUrl,
} from "../config.js";
import { deliver } from "../notifications.js";
import { SqliteStore } from "../store.js";
import {
  changeTransactionStatus,
  generateTransaction,
} from "../transactions.js";

const PAYMENT_STATUS_CHANGE = 1;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values } = parseArgs({
  options: { "payment-id": { type: "string" } },
});
const paymentId = values["payment-id"];

if (!transactionNotificationUrl) {
  fail("MOCK_CIELO_TRANSACTION_NOTIFICATION_URL is not configured.");
}

const store = new SqliteStore(databaseFile);
try {
  let transaction;
  if (paymentId) {
    const stored = store.getTransaction(paymentId);
    if (!stored) {
      fail(`Unknown payment ID: ${paymentId}`);
    }
    transaction = changeTransactionStatus(stored);
    store.updateTransaction(transaction);
  } else {
    if (!transactionMerchantId) {
      fail("MOCK_CIELO_TRANSACTION_MERCHANT_ID is not configured.");
    }
    transaction = generateTransaction(transactionMerchantId);
    store.createTransaction(transaction);
  }

  const delivered = await deliver(transactionNotificationUrl, {
    PaymentId: transaction.Payment.PaymentId,
    ChangeType: PAYMENT_STATUS_CHANGE,
  });
  console.log(
    `Notified PaymentId ${transaction.Payment.PaymentId} ` +
      `(${transaction.Payment.Type}, status ${transaction.Payment.Status})` +
      (delivered ? "." : ": delivery failed after 3 attempts."),
  );
  if (!delivered) {
    process.exitCode = 1;
  }
} finally {
  store.close();
}
