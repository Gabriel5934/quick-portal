import { mkdirSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type {
  SellerPayload,
  StoredSeller,
  TransactionResponse,
} from "./types.js";

const schema = `
  CREATE TABLE IF NOT EXISTS sellers (
    merchant_id TEXT PRIMARY KEY,
    document_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    onboarding_data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS onboarding_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempted_at TEXT NOT NULL,
    document_number TEXT,
    request TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS onboarding_attempts_document_number
    ON onboarding_attempts (document_number);

  CREATE TABLE IF NOT EXISTS access_tokens (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    payment_id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    response TEXT NOT NULL
  );
`;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class SqliteStore {
  private readonly database: DatabaseSync;

  constructor(filePath: string) {
    if (filePath !== ":memory:") {
      mkdirSync(path.dirname(filePath), { recursive: true });
    }
    this.database = new DatabaseSync(filePath);
    this.database.exec("PRAGMA journal_mode = WAL;");
    this.database.exec(schema);
  }

  close(): void {
    this.database.close();
  }

  recordResponse(
    request: unknown,
    responseStatus: number,
    responseBody: unknown,
  ): void {
    this.insertAttempt(request, responseStatus, responseBody);
  }

  createSeller(
    payload: SellerPayload,
  ):
    | { created: true; seller: StoredSeller }
    | { created: false; merchantId: string } {
    return this.transaction(() => {
      const existing = this.database
        .prepare("SELECT merchant_id FROM sellers WHERE document_number = ?")
        .get(payload.DocumentNumber) as { merchant_id: string } | undefined;

      if (existing) {
        this.insertAttempt(payload, 400, [
          {
            Code: "SellerAlreadyExists",
            Message: "A seller with this document is already registered.",
          },
        ]);
        return { created: false, merchantId: existing.merchant_id };
      }

      const seller: StoredSeller = {
        MerchantId: randomUUID(),
        Status: "Pending",
        CreatedAt: new Date().toISOString(),
        OnboardingData: payload,
      };
      this.database
        .prepare(
          `INSERT INTO sellers
             (merchant_id, document_number, status, created_at, onboarding_data)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          seller.MerchantId,
          payload.DocumentNumber,
          seller.Status,
          seller.CreatedAt,
          JSON.stringify(payload),
        );
      this.insertAttempt(payload, 201, { MerchantId: seller.MerchantId });
      return { created: true, seller };
    });
  }

  /**
   * Insert a seller under a fixed MerchantId, replacing any seller that has
   * the same MerchantId or document.
   */
  seedSeller(merchantId: string, payload: SellerPayload): { replaced: number } {
    return this.transaction(() => {
      const { changes } = this.database
        .prepare("DELETE FROM sellers WHERE merchant_id = ? OR document_number = ?")
        .run(merchantId, payload.DocumentNumber);

      this.database
        .prepare(
          `INSERT INTO sellers
             (merchant_id, document_number, status, created_at, onboarding_data)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          merchantId,
          payload.DocumentNumber,
          "Pending",
          new Date().toISOString(),
          JSON.stringify(payload),
        );
      return { replaced: Number(changes) };
    });
  }

  /** Store an access token by its SHA-256 hash, pruning expired tokens. */
  createAccessToken(token: string, expiresAt: number): void {
    this.transaction(() => {
      this.database
        .prepare("DELETE FROM access_tokens WHERE expires_at <= ?")
        .run(Date.now());
      this.database
        .prepare("INSERT INTO access_tokens (token_hash, expires_at) VALUES (?, ?)")
        .run(hashToken(token), expiresAt);
    });
  }

  /** Whether the token was issued and has not expired; expired tokens are deleted. */
  isAccessTokenValid(token: string): boolean {
    const tokenHash = hashToken(token);
    const row = this.database
      .prepare("SELECT expires_at FROM access_tokens WHERE token_hash = ?")
      .get(tokenHash) as { expires_at: number } | undefined;
    if (row && row.expires_at > Date.now()) {
      return true;
    }
    if (row) {
      this.database
        .prepare("DELETE FROM access_tokens WHERE token_hash = ?")
        .run(tokenHash);
    }
    return false;
  }

  createTransaction(response: TransactionResponse): void {
    this.database
      .prepare(
        `INSERT INTO transactions (payment_id, merchant_id, created_at, response)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        response.Payment.PaymentId,
        response.MerchantId,
        new Date().toISOString(),
        JSON.stringify(response),
      );
  }

  getTransaction(paymentId: string): TransactionResponse | null {
    const row = this.database
      .prepare("SELECT response FROM transactions WHERE payment_id = ?")
      .get(paymentId) as { response: string } | undefined;
    return row ? (JSON.parse(row.response) as TransactionResponse) : null;
  }

  updateTransaction(response: TransactionResponse): void {
    this.database
      .prepare("UPDATE transactions SET response = ? WHERE payment_id = ?")
      .run(JSON.stringify(response), response.Payment.PaymentId);
  }

  private insertAttempt(
    request: unknown,
    responseStatus: number,
    responseBody: unknown,
  ): void {
    const documentNumber =
      typeof request === "object" &&
      request !== null &&
      "DocumentNumber" in request &&
      typeof request.DocumentNumber === "string"
        ? request.DocumentNumber
        : null;

    this.database
      .prepare(
        `INSERT INTO onboarding_attempts
           (attempted_at, document_number, request, response_status, response_body)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        new Date().toISOString(),
        documentNumber,
        JSON.stringify(request ?? null),
        responseStatus,
        JSON.stringify(responseBody ?? null),
      );
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
