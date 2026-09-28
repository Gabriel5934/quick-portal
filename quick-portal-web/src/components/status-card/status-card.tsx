import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

interface StatusCardProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

export function StatusCard({ title, subtitle, children }: StatusCardProps) {
  return (
    <Paper
      component="section"
      aria-label={title}
      variant="outlined"
      sx={{
        p: 2,
        mb: 2,
        display: "flex",
        alignItems: { xs: "flex-start", sm: "center" },
        flexDirection: { xs: "column", sm: "row" },
        justifyContent: "space-between",
        gap: 2,
      }}
    >
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        {children}
      </Box>
    </Paper>
  );
}
