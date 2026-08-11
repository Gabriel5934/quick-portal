import { createFileRoute } from "@tanstack/react-router";
import {
  RecurringFeeBusinessGuard,
  RecurringFeeWizardPage,
  ScheduleStep,
} from "../../features/recurring-fees";

export const Route = createFileRoute(
  "/_authRoutes/recurring-fees/new/schedule",
)({ component: RouteComponent });
function RouteComponent() {
  return (
    <RecurringFeeBusinessGuard>
      <RecurringFeeWizardPage currentStep={2}>
        <ScheduleStep />
      </RecurringFeeWizardPage>
    </RecurringFeeBusinessGuard>
  );
}
