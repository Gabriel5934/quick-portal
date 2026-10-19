import Box from "@mui/material/Box";
import { createFileRoute } from "@tanstack/react-router";
import { ReceivedInvitesPage } from "../../features/access";

export const Route = createFileRoute("/_authRoutes/convites")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Box sx={{ p: 3 }}>
      <ReceivedInvitesPage />
    </Box>
  );
}
