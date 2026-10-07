import { randomBytes } from "node:crypto";

import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import {
  MOCK_CLIENT_SECRET,
  MOCK_MERCHANT_ID,
  TOKEN_LIFETIME_SECONDS,
  onboardingMode,
} from "./config.js";
import { captureRequestAndResponse, logParsedRequest } from "./logging.js";
import { scheduleOnboardingNotifications } from "./notifications.js";
import type { SqliteStore } from "./store.js";
import type { CieloError } from "./types.js";
import { validateSellerPayload } from "./validation.js";

function invalidClient(response: Response): void {
  response.status(400).json({
    error: "invalid_client",
    error_description: "A autenticação do cliente falhou.",
  });
}

function parseBasicCredentials(
  header: string | undefined,
): [string, string] | null {
  if (!header?.startsWith("Basic ")) {
    return null;
  }
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return null;
    }
    return [decoded.slice(0, separator), decoded.slice(separator + 1)];
  } catch {
    return null;
  }
}

function bearerTokenGuard(store: SqliteStore) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const header = request.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token || !store.isAccessTokenValid(token)) {
      const body: CieloError[] = [
        { Code: "Unauthorized", Message: "Access token is invalid or expired." },
      ];
      response.status(401).json(body);
      return;
    }
    next();
  };
}

export function createApp(store: SqliteStore) {
  const app = express();
  app.disable("x-powered-by");
  const requireBearerToken = bearerTokenGuard(store);

  // Registered before the logging middleware so Docker health checks stay out of the logs.
  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.use(captureRequestAndResponse);
  app.use(express.json({ limit: "256kb", strict: true }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  app.use(logParsedRequest);

  app.post("/oauth2/token", (request, response) => {
    const credentials = parseBasicCredentials(request.header("authorization"));
    if (
      !credentials ||
      credentials[0] !== MOCK_MERCHANT_ID ||
      credentials[1] !== MOCK_CLIENT_SECRET
    ) {
      invalidClient(response);
      return;
    }
    if (request.body?.grant_type !== "client_credentials") {
      response.status(400).json({
        error: "unsupported_grant_type",
        error_description: "O grant_type deve ser client_credentials.",
      });
      return;
    }

    const accessToken = randomBytes(32).toString("base64url");
    store.createAccessToken(
      accessToken,
      Date.now() + TOKEN_LIFETIME_SECONDS * 1_000,
    );
    response.json({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: TOKEN_LIFETIME_SECONDS,
    });
  });

  app.post("/api/merchants", requireBearerToken, (request, response) => {
    if (onboardingMode === "validation_error") {
      const body: CieloError[] = [
        { Code: "RequestValidationError", Message: "Invalid request format." },
      ];
      store.recordResponse(request.body, 400, body);
      response.status(400).json(body);
      return;
    }
    if (onboardingMode === "server_error") {
      const body: CieloError[] = [
        { Code: "InternalServerError", Message: "Internal server error." },
      ];
      store.recordResponse(request.body, 500, body);
      response.status(500).json(body);
      return;
    }
    if (onboardingMode === "malformed_success") {
      const body = { Status: "Pending" };
      store.recordResponse(request.body, 201, body);
      response.status(201).json(body);
      return;
    }

    const validation = validateSellerPayload(request.body);
    if (!validation.success) {
      store.recordResponse(request.body, 400, validation.errors);
      response.status(400).json(validation.errors);
      return;
    }

    const result = store.createSeller(validation.data);
    if (!result.created) {
      response.status(400).json([
        {
          Code: "SellerAlreadyExists",
          Message: "A seller with this document is already registered.",
        },
      ] satisfies CieloError[]);
      return;
    }
    response.status(201).json({ MerchantId: result.seller.MerchantId });
    scheduleOnboardingNotifications(result.seller.MerchantId);
  });

  app.get("/1/sales/:paymentId", requireBearerToken, (request, response) => {
    const transaction = store.getTransaction(String(request.params.paymentId));
    if (!transaction) {
      response.status(404).json([
        { Code: "NotFound", Message: "Payment not found." },
      ] satisfies CieloError[]);
      return;
    }
    response.json(transaction);
  });

  app.use((_request, response) => {
    response
      .status(404)
      .json([
        { Code: "NotFound", Message: "The requested resource was not found." },
      ] satisfies CieloError[]);
  });

  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 400
    ) {
      response.status(400).json([
        {
          Code: "RequestValidationError",
          Message: "Invalid request format.",
        },
      ] satisfies CieloError[]);
      return;
    }
    console.error(error);
    response
      .status(500)
      .json([
        { Code: "InternalServerError", Message: "Internal server error." },
      ] satisfies CieloError[]);
  };
  app.use(errorHandler);

  return app;
}
