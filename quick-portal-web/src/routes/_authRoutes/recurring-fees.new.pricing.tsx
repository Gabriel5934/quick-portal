import { createFileRoute } from "@tanstack/react-router";
import {
  PricingStep,
  RecurringFeeBusinessGuard,
  RecurringFeeWizardPage,
} from "../../features/recurring-fees";

export const Route = createFileRoute("/_authRoutes/recurring-fees/new/pricing")(
  { component: RouteComponent },
);
function RouteComponent() {
  return (
    <RecurringFeeBusinessGuard>
      <RecurringFeeWizardPage currentStep={1}>
        <PricingStep />
      </RecurringFeeWizardPage>
    </RecurringFeeBusinessGuard>
  );
}
