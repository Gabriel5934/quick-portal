import { createFileRoute } from "@tanstack/react-router";
import { Sales } from "../../features/sales";

export const Route = createFileRoute("/_authRoutes/sales")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Sales />;
}
