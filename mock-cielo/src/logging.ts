import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

interface RequestLogState {
  requestId: string;
  startedAt: number;
  requestLogged: boolean;
  responseBody?: unknown;
}

const requestStates = new WeakMap<Request, RequestLogState>();

const redactedKeys = new Set([
  "access_token",
  "authorization",
  "client_secret",
  "password",
  "secret",
  "token",
]);

function sanitize(value: unknown): unknown {
  if (Buffer.isBuffer(value)) {
    return `<Buffer ${value.length} bytes>`;
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      redactedKeys.has(key.toLowerCase()) ? "[REDACTED]" : sanitize(entry),
    ]),
  );
}

function writeLog(entry: Record<string, unknown>): void {
  console.log(
    JSON.stringify({ timestamp: new Date().toISOString(), ...entry }),
  );
}

function logRequest(request: Request, state: RequestLogState): void {
  if (state.requestLogged) {
    return;
  }
  state.requestLogged = true;
  writeLog({
    event: "request.received",
    requestId: state.requestId,
    method: request.method,
    path: request.originalUrl,
    contentType: request.header("content-type") ?? null,
    query: sanitize(request.query),
    body: sanitize(request.body),
  });
}

export function captureRequestAndResponse(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const state: RequestLogState = {
    requestId: randomUUID(),
    startedAt: performance.now(),
    requestLogged: false,
  };
  requestStates.set(request, state);

  const originalJson = response.json.bind(response);
  response.json = ((body: unknown) => {
    state.responseBody = body;
    return originalJson(body);
  }) as Response["json"];

  const originalSend = response.send.bind(response);
  response.send = ((body: unknown) => {
    if (state.responseBody === undefined) {
      state.responseBody = body;
    }
    return originalSend(body);
  }) as Response["send"];

  response.once("finish", () => {
    logRequest(request, state);
    writeLog({
      event: "response.sent",
      requestId: state.requestId,
      method: request.method,
      path: request.originalUrl,
      statusCode: response.statusCode,
      contentType: response.getHeader("content-type") ?? null,
      durationMs: Math.round((performance.now() - state.startedAt) * 100) / 100,
      body: sanitize(state.responseBody),
    });
  });

  next();
}

export function logParsedRequest(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  const state = requestStates.get(request);
  if (state) {
    logRequest(request, state);
  }
  next();
}
