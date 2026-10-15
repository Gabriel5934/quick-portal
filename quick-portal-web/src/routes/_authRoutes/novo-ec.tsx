import Box from "@mui/material/Box";
import { createFileRoute } from "@tanstack/react-router";
import { NewBusiness } from "../../features/business/new-business/new-business-page";

export const Route = createFileRoute("/_authRoutes/novo-ec")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Box sx={{ p: 3 }}>
      <NewBusiness />
    </Box>
  );
}
