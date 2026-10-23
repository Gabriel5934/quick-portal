import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

/** Shown while a route guard waits for the boot refresh. */
export function SessionPending() {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CircularProgress aria-label="Carregando sessão" />
    </Box>
  );
}
