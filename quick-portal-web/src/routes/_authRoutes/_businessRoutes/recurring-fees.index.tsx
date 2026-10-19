import { createFileRoute } from "@tanstack/react-router";
import { RecurringFeesPage } from "../../../features/recurring-fees";

export const Route = createFileRoute("/_authRoutes/_businessRoutes/recurring-fees/")({
  component: RecurringFeesPage,
});
