import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { Server } from "node:http";

const MASTER_MERCHANT_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_SECRET = "test-client-secret";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// config.ts reads the environment when it is first imported.
process.env.MOCK_CIELO_MERCHANT_ID = MASTER_MERCHANT_ID;
process.env.MOCK_CIELO_CLIENT_SECRET = CLIENT_SECRET;
process.env.MOCK_CIELO_ONBOARDING_MODE = "success";
process.env.MOCK_CIELO_NOTIFICATION_URL = "";

const { createApp } = await import("./app.js");
const { SqliteStore } = await import("./store.js");

function sellerPayload(documentType: "CPF" | "CNPJ", documentNumber: string) {
  return {
    Type: "Subordinate",
    MasterMerchantId: MASTER_MERCHANT_ID,
    ContactPhone: "11987654321",
    ContactName: "Maria Silva",
    MailAddress: "maria@example.com",
    DocumentType: documentType,
    DocumentNumber: documentNumber,
    CorporateName: "Maria Silva Comercio",
    FancyName: documentType === "CNPJ" ? "Loja da Maria" : "",
    ...(documentType === "CPF"
      ? { BirthdayDate: "1990-05-17", BusinessActivityId: "123" }
      : {}),
    BankAccount: {
      Bank: "341",
      BankAccountType: "CheckingAccount",
      Number: "12345",
      VerifierDigit: "6",
      AgencyNumber: "1234",
      AgencyDigit: "1",
      DocumentType: documentType,
      DocumentNumber: documentNumber,
    },
    Address: {
      Number: "100",
      ZipCode: "01310100",
      Street: "Avenida Paulista",
      Neighborhood: "Bela Vista",
      City: "São Paulo",
      State: "SP",
    },
  };
}

describe("POST /api/merchants", () => {
  let directory: string;
  let databaseFile: string;
  let store: InstanceType<typeof SqliteStore>;
  let server: Server;
  let baseUrl: string;
  let accessToken: string;

  before(async () => {
    directory = mkdtempSync(path.join(tmpdir(), "cielo-mock-test-"));
    databaseFile = path.join(directory, "cielo.sqlite3");
    store = new SqliteStore(databaseFile);
    server = createApp(store).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const tokenResponse = await fetch(`${baseUrl}/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${MASTER_MERCHANT_ID}:${CLIENT_SECRET}`,
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    assert.equal(tokenResponse.status, 200);
    accessToken = ((await tokenResponse.json()) as { access_token: string })
      .access_token;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  async function onboard(payload: unknown): Promise<Response> {
    return fetch(`${baseUrl}/api/merchants`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  function lastRecordedAttempt(documentNumber: string) {
    const database = new DatabaseSync(databaseFile, { readOnly: true });
    try {
      const row = database
        .prepare(
          `SELECT response_status, response_body FROM onboarding_attempts
           WHERE document_number = ? ORDER BY id DESC LIMIT 1`,
        )
        .get(documentNumber) as
        | { response_status: number; response_body: string }
        | undefined;
      assert.ok(row);
      return { status: row.response_status, body: JSON.parse(row.response_body) };
    } finally {
      database.close();
    }
  }

  test("returns the created CNPJ seller with a numeric DocumentType", async () => {
    const response = await onboard(sellerPayload("CNPJ", "96462142000140"));

    assert.equal(response.status, 201);
    const body = (await response.json()) as Record<string, unknown>;
    assert.match(String(body.Id), UUID_PATTERN);
    assert.deepEqual(body, {
      Id: body.Id,
      MerchantId: body.Id,
      Type: "Subordinate",
      MasterMerchantId: MASTER_MERCHANT_ID,
      CorporateName: "Maria Silva Comercio",
      FancyName: "Loja da Maria",
      DocumentType: 2,
      DocumentNumber: "96462142000140",
    });
    assert.deepEqual(lastRecordedAttempt("96462142000140"), {
      status: 201,
      body,
    });
  });

  test("returns the created CPF seller with a numeric DocumentType", async () => {
    const response = await onboard(sellerPayload("CPF", "52839789801"));

    assert.equal(response.status, 201);
    const body = (await response.json()) as Record<string, unknown>;
    assert.match(String(body.Id), UUID_PATTERN);
    assert.equal(body.MerchantId, body.Id);
    assert.equal(body.DocumentType, 1);
    assert.equal(body.DocumentNumber, "52839789801");
    assert.equal(body.FancyName, "");
    assert.deepEqual(lastRecordedAttempt("52839789801"), { status: 201, body });
  });

  test("rejects a document that is already registered", async () => {
    const payload = sellerPayload("CNPJ", "11444777000161");
    assert.equal((await onboard(payload)).status, 201);

    const response = await onboard(payload);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), [
      {
        Code: "SellerAlreadyExists",
        Message: "A seller with this document is already registered.",
      },
    ]);
    assert.equal(lastRecordedAttempt("11444777000161").status, 400);
  });
});
