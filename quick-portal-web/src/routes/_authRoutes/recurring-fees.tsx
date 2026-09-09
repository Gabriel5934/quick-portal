import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RecurringFeeBusinessGuard } from "../../features/recurring-fees";

export const Route = createFileRoute("/_authRoutes/recurring-fees")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RecurringFeeBusinessGuard>
      <Outlet />
    </RecurringFeeBusinessGuard>
  );
}
