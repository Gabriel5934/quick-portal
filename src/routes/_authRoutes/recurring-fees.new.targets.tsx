import { createFileRoute } from "@tanstack/react-router";
import {
  RecurringFeeBusinessGuard,
  RecurringFeeWizardPage,
  TargetsStep,
} from "../../features/recurring-fees";

export const Route = createFileRoute("/_authRoutes/recurring-fees/new/targets")(
  { component: RouteComponent },
);
function RouteComponent() {
  return (
    <RecurringFeeBusinessGuard>
      <RecurringFeeWizardPage currentStep={3}>
        <TargetsStep />
      </RecurringFeeWizardPage>
    </RecurringFeeBusinessGuard>
  );
}
