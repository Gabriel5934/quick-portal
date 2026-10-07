import {
  MOCK_MERCHANT_ID,
  type NotificationScenario,
  notificationDelaySeconds,
  notificationScenario,
  notificationToken,
  notificationUrl,
} from "./config.js";
import { writeLog } from "./logging.js";

const DELIVERY_ATTEMPTS = 3;

const KycStatus = {
  UnderAnalysis: 1,
  Approved: 2,
  Rejected: 4,
} as const;

const BankAccountStatus = {
  Processing: 2,
  Success: 3,
  Error: 4,
} as const;

const OnboardingStatus = {
  UnderAnalysis: 1,
  Approved: 2,
  AwaitingMerchantAction: 3,
  Banned: 5,
} as const;

const scenarioStatuses: Record<
  NotificationScenario,
  { kyc: number; bankAccount: number; onboarding: number }
> = {
  approved: {
    kyc: KycStatus.Approved,
    bankAccount: BankAccountStatus.Success,
    onboarding: OnboardingStatus.Approved,
  },
  kyc_rejected: {
    kyc: KycStatus.Rejected,
    bankAccount: BankAccountStatus.Success,
    onboarding: OnboardingStatus.Banned,
  },
  bank_error: {
    kyc: KycStatus.Approved,
    bankAccount: BankAccountStatus.Error,
    onboarding: OnboardingStatus.AwaitingMerchantAction,
  },
  under_analysis: {
    kyc: KycStatus.UnderAnalysis,
    bankAccount: BankAccountStatus.Processing,
    onboarding: OnboardingStatus.UnderAnalysis,
  },
};

const sleep = (seconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, seconds * 1_000));

/** Posts `payload` to `url` up to three times, until it is answered with 200. */
export async function deliver(
  url: string,
  payload: { ChangeType: number } & Record<string, unknown>,
): Promise<boolean> {
  for (let attempt = 1; attempt <= DELIVERY_ATTEMPTS; attempt += 1) {
    let statusCode: number | null = null;
    let error: string | null = null;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cielo-Webhook-Token": notificationToken,
        },
        body: JSON.stringify(payload),
      });
      statusCode = response.status;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    writeLog({
      event: "notification.delivery",
      url,
      attempt,
      changeType: payload.ChangeType,
      body: payload,
      statusCode,
      error,
    });
    if (statusCode === 200) {
      return true;
    }
  }
  return false;
}

async function sendOnboardingNotifications(
  url: string,
  merchantId: string,
): Promise<void> {
  const final = scenarioStatuses[notificationScenario];
  // Until its own notification arrives, the bank account is still being
  // validated and the overall onboarding remains under analysis.
  const onboarding = (kyc: number, bankAccount: number, status: number) => ({
    ChangeType: 23,
    MasterMerchantId: MOCK_MERCHANT_ID,
    Data: {
      SubordinateMerchantId: merchantId,
      OnboardingStatus: status,
      KycAnalysisInfo: { Status: kyc },
      BankAccountValidation: { Status: bankAccount },
    },
  });

  const notifications = [
    {
      ChangeType: 20,
      MasterMerchantId: MOCK_MERCHANT_ID,
      Data: { SubordinateMerchantId: merchantId, Status: final.kyc },
    },
    onboarding(
      final.kyc,
      BankAccountStatus.Processing,
      OnboardingStatus.UnderAnalysis,
    ),
    {
      ChangeType: 21,
      MasterMerchantId: MOCK_MERCHANT_ID,
      Data: {
        MerchantId: merchantId,
        MerchantType: "Subordinate",
        Status: final.bankAccount,
      },
    },
    onboarding(final.kyc, final.bankAccount, final.onboarding),
  ];

  for (const notification of notifications) {
    await sleep(notificationDelaySeconds);
    await deliver(url, notification);
  }
}

export function scheduleOnboardingNotifications(merchantId: string): void {
  if (!notificationUrl) {
    return;
  }
  sendOnboardingNotifications(notificationUrl, merchantId).catch((error: unknown) => {
    console.error(error);
  });
}
