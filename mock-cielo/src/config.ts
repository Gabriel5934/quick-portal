import path from "node:path";

export const MOCK_MERCHANT_ID = "f88cc14d-c796-4939-957e-de4dddcb2257";
export const MOCK_CLIENT_SECRET = "quick-portal-mock-secret";

export const TOKEN_LIFETIME_SECONDS = 1_200;

export const port = Number.parseInt(process.env.PORT ?? "3000", 10);

export const dataFile = path.resolve(
  process.env.MOCK_CIELO_DATA_FILE ?? "data/cielo.json",
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
