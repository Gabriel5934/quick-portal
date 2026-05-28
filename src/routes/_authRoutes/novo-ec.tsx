import { createFileRoute } from "@tanstack/react-router";
import { NewBusiness } from "../../features/business/new-business-page";

export const Route = createFileRoute("/_authRoutes/novo-ec")({
  component: RouteComponent,
});

function RouteComponent() {
  return <NewBusiness />;
}
