import { createFileRoute } from "@tanstack/react-router";
import { NewPlan } from "../../features/plans";

export const Route = createFileRoute("/_authRoutes/novo-plano")({
  component: RouteComponent,
});

function RouteComponent() {
  return <NewPlan />;
}
