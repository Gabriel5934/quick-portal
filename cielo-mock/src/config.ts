import path from "node:path";

function requireEnv(name: string): string {
  const configured = process.env[name];
  if (!configured) {
    throw new Error(`Missing ${name}. Set it in cielo-mock/.env.`);
  }
  return configured;
}

function resolveTokenLifetimeSeconds(): number {
  const configured = process.env.MOCK_CIELO_TOKEN_LIFETIME_SECONDS ?? "1200";
  const lifetime = Number(configured);
  if (!Number.isInteger(lifetime) || lifetime <= 0) {
    throw new Error(
      `Invalid MOCK_CIELO_TOKEN_LIFETIME_SECONDS: ${configured}. Expected a positive integer.`,
    );
  }
  return lifetime;
}

// Must match the backend's CIELO_MERCHANT_ID and CIELO_CLIENT_SECRET.
export const MOCK_MERCHANT_ID = requireEnv("MOCK_CIELO_MERCHANT_ID");
export const MOCK_CLIENT_SECRET = requireEnv("MOCK_CIELO_CLIENT_SECRET");

export const TOKEN_LIFETIME_SECONDS = resolveTokenLifetimeSeconds();

export const port = Number.parseInt(process.env.PORT ?? "3000", 10);

export const databaseFile = path.resolve(
  process.env.MOCK_CIELO_DATABASE_FILE ?? "data/cielo.sqlite3",
);

export const onboardingModes = [
  "success",
  "validation_error",
  "server_error",
  "malformed_success",
] as const;

export type OnboardingMode = (typeof onboardingModes)[number];

function resolveOnboardingMode(): OnboardingMode {
  const configured = process.env.MOCK_CIELO_ONBOARDING_MODE ?? "success";
  if (onboardingModes.includes(configured as OnboardingMode)) {
    return configured as OnboardingMode;
  }
  throw new Error(
    `Invalid MOCK_CIELO_ONBOARDING_MODE: ${configured}. Expected one of ${onboardingModes.join(", ")}.`,
  );
}

export const onboardingMode = resolveOnboardingMode();

export const notificationScenarios = [
  "approved",
  "kyc_rejected",
  "bank_error",
  "under_analysis",
] as const;

export type NotificationScenario = (typeof notificationScenarios)[number];

function resolveNotificationScenario(): NotificationScenario {
  const configured = process.env.MOCK_CIELO_NOTIFICATION_SCENARIO ?? "approved";
  if (notificationScenarios.includes(configured as NotificationScenario)) {
    return configured as NotificationScenario;
  }
  throw new Error(
    `Invalid MOCK_CIELO_NOTIFICATION_SCENARIO: ${configured}. Expected one of ${notificationScenarios.join(", ")}.`,
  );
}

function resolveNotificationDelaySeconds(): number {
  const configured = process.env.MOCK_CIELO_NOTIFICATION_DELAY_SECONDS ?? "5";
  const delay = Number(configured);
  if (!Number.isFinite(delay) || delay < 0) {
    throw new Error(
      `Invalid MOCK_CIELO_NOTIFICATION_DELAY_SECONDS: ${configured}. Expected a non-negative number.`,
    );
  }
  return delay;
}

// Notifications are disabled when no destination URL is configured.
export const notificationUrl = process.env.MOCK_CIELO_NOTIFICATION_URL || null;
export const notificationToken =
  process.env.MOCK_CIELO_NOTIFICATION_TOKEN ?? "";
export const notificationDelaySeconds = resolveNotificationDelaySeconds();
export const notificationScenario = resolveNotificationScenario();

// Transaction notifications are sent only by the notify:transaction script.
export const transactionNotificationUrl =
  process.env.MOCK_CIELO_TRANSACTION_NOTIFICATION_URL || null;
export const transactionMerchantId =
  process.env.MOCK_CIELO_TRANSACTION_MERCHANT_ID || null;
