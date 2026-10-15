import { createFileRoute } from "@tanstack/react-router";
import { AdminBusinessGuard } from "../../../layout/admin-business-guard";
import {
  RecurringFeeWizardPage,
  ScheduleStep,
} from "../../../features/recurring-fees";

export const Route = createFileRoute(
  "/_authRoutes/_businessRoutes/recurring-fees/new/schedule",
)({ component: RouteComponent });
function RouteComponent() {
  return (
    <AdminBusinessGuard>
      <RecurringFeeWizardPage currentStep={2}>
        <ScheduleStep />
      </RecurringFeeWizardPage>
    </AdminBusinessGuard>
  );
}
