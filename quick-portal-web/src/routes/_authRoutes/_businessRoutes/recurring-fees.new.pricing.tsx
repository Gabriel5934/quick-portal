import { createFileRoute } from "@tanstack/react-router";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";
import {
  PricingStep,
  RecurringFeeWizardPage,
} from "../../../features/recurring-fees";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/recurring-fees/new/pricing")(
  { component: RouteComponent },
);
function RouteComponent() {
  return (
    <AdminBusinessGuard>
      <RecurringFeeWizardPage currentStep={1}>
        <PricingStep />
      </RecurringFeeWizardPage>
    </AdminBusinessGuard>
  );
}
