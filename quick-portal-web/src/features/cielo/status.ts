import type { StatusTone } from "../../components/status-card";
import type { CieloNotificationStatus, CieloSubmissionStatus } from "./types";

// Tones are chosen from Cielo's status values, never from the API labels.
const submissionBadges: Record<
  CieloSubmissionStatus,
  { label: string; tone: StatusTone }
> = {
  SENT: { label: "Enviado", tone: "success" },
  FAILED: { label: "Falhou", tone: "error" },
  INTERVENTION_REQUIRED: { label: "Intervenção necessária", tone: "action" },
};

const kycTones: Record<number, StatusTone> = {
  1: "pending",
  2: "success",
  3: "warning",
  4: "error",
};

const bankAccountTones: Record<number, StatusTone> = {
  0: "error",
  1: "pending",
  2: "pending",
  3: "success",
  4: "error",
};

const onboardingTones: Record<number, StatusTone> = {
  1: "pending",
  2: "success",
  3: "action",
  4: "neutral",
  5: "error",
};

export function submissionBadge(status: CieloSubmissionStatus) {
  return submissionBadges[status];
}

function notificationBadge(
  status: CieloNotificationStatus | null,
  tones: Record<number, StatusTone>,
): { label: string; tone: StatusTone } {
  if (status === null) return { label: "Aguardando", tone: "pending" };
  return { label: status.label, tone: tones[status.value] ?? "neutral" };
}

export function kycBadge(status: CieloNotificationStatus | null) {
  return notificationBadge(status, kycTones);
}

export function bankAccountBadge(status: CieloNotificationStatus | null) {
  return notificationBadge(status, bankAccountTones);
}

export function onboardingBadge(status: CieloNotificationStatus | null) {
  return notificationBadge(status, onboardingTones);
}
