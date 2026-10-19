import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BusinessLayout } from "../../../layout/business-layout";

export const Route = createFileRoute("/_authRoutes/_businessRoutes")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <BusinessLayout>
      <Outlet />
    </BusinessLayout>
  );
}
