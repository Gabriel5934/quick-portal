import { createFileRoute } from "@tanstack/react-router";
import {
  RecurringFeeBusinessGuard,
  RecurringFeeWizardPage,
  ReviewStep,
} from "../../features/recurring-fees";

export const Route = createFileRoute("/_authRoutes/recurring-fees/new/review")({
  component: RouteComponent,
});
function RouteComponent() {
  return (
    <RecurringFeeBusinessGuard>
      <RecurringFeeWizardPage currentStep={4}>
        <ReviewStep />
      </RecurringFeeWizardPage>
    </RecurringFeeBusinessGuard>
  );
}
