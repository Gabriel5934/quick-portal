import { createFileRoute } from "@tanstack/react-router";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";
import {
  DetailsStep,
  RecurringFeeWizardPage,
} from "../../../features/recurring-fees";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/recurring-fees/new/details")(
  { component: RouteComponent },
);
function RouteComponent() {
  return (
    <AdminBusinessGuard>
      <RecurringFeeWizardPage currentStep={0}>
        <DetailsStep />
      </RecurringFeeWizardPage>
    </AdminBusinessGuard>
  );
}
