import { createFileRoute } from "@tanstack/react-router";
import { Plans } from "../../features/plans";

export const Route = createFileRoute("/_authRoutes/planos-e-taxas")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Plans />;
}
