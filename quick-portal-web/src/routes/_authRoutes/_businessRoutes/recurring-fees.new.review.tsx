import { createFileRoute } from "@tanstack/react-router";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";
import {
  RecurringFeeWizardPage,
  ReviewStep,
} from "../../../features/recurring-fees";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/recurring-fees/new/review")({
  component: RouteComponent,
});
function RouteComponent() {
  return (
    <AdminBusinessGuard>
      <RecurringFeeWizardPage currentStep={3}>
        <ReviewStep />
      </RecurringFeeWizardPage>
    </AdminBusinessGuard>
  );
}
