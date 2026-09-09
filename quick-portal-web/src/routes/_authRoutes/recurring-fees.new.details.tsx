import { createFileRoute } from "@tanstack/react-router";
import {
  DetailsStep,
  RecurringFeeBusinessGuard,
  RecurringFeeWizardPage,
} from "../../features/recurring-fees";

export const Route = createFileRoute("/_authRoutes/recurring-fees/new/details")(
  { component: RouteComponent },
);
function RouteComponent() {
  return (
    <RecurringFeeBusinessGuard>
      <RecurringFeeWizardPage currentStep={0}>
        <DetailsStep />
      </RecurringFeeWizardPage>
    </RecurringFeeBusinessGuard>
  );
}
