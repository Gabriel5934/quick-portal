import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  MockDatabase,
  OnboardingAttempt,
  SellerPayload,
  StoredSeller,
} from "./types.js";

const emptyDatabase = (): MockDatabase => ({
  sellers: [],
  onboardingAttempts: [],
});

export class JsonStore {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      await this.write(emptyDatabase());
    }
  }

  async recordResponse(
    request: unknown,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    await this.runExclusive(async () => {
      const database = await this.read();
      database.onboardingAttempts.push(
        this.attempt(request, responseStatus, responseBody),
      );
      await this.write(database);
    });
  }

  async createSeller(
    payload: SellerPayload,
  ): Promise<
    | { created: true; seller: StoredSeller }
    | { created: false; merchantId: string }
  > {
    return this.runExclusive(async () => {
      const database = await this.read();
      const existing = database.sellers.find(
        (seller) =>
          seller.OnboardingData.DocumentNumber === payload.DocumentNumber,
      );

      if (existing) {
        const responseBody = [
          {
            Code: "SellerAlreadyExists",
            Message: "A seller with this document is already registered.",
          },
        ];
        database.onboardingAttempts.push(
          this.attempt(payload, 400, responseBody),
        );
        await this.write(database);
        return { created: false, merchantId: existing.MerchantId };
      }

      const seller: StoredSeller = {
        MerchantId: randomUUID(),
        Status: "Pending",
        CreatedAt: new Date().toISOString(),
        OnboardingData: payload,
      };
      const responseBody = { MerchantId: seller.MerchantId };
      database.sellers.push(seller);
      database.onboardingAttempts.push(
        this.attempt(payload, 201, responseBody),
      );
      await this.write(database);
      return { created: true, seller };
    });
  }

  private attempt(
    request: unknown,
    responseStatus: number,
    responseBody: unknown,
  ): OnboardingAttempt {
    const documentNumber =
      typeof request === "object" &&
      request !== null &&
      "DocumentNumber" in request &&
      typeof request.DocumentNumber === "string"
        ? request.DocumentNumber
        : null;

    return {
      AttemptedAt: new Date().toISOString(),
      DocumentNumber: documentNumber,
      Request: request,
      ResponseStatus: responseStatus,
      ResponseBody: responseBody,
    };
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationQueue;
    let release: () => void = () => undefined;
    this.operationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async read(): Promise<MockDatabase> {
    const contents = await readFile(this.filePath, "utf8");
    const parsed: unknown = JSON.parse(contents);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("sellers" in parsed) ||
      !Array.isArray(parsed.sellers) ||
      !("onboardingAttempts" in parsed) ||
      !Array.isArray(parsed.onboardingAttempts)
    ) {
      throw new Error(`Invalid mock Cielo data file: ${this.filePath}`);
    }
    return parsed as MockDatabase;
  }

  private async write(database: MockDatabase): Promise<void> {
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }
}
