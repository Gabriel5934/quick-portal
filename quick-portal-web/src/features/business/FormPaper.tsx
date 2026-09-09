import type { SvgIconComponent } from "@mui/icons-material";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

type FormPaperProps = {
  title: string;
  subtitle: string;
  Icon: SvgIconComponent;
  action?: ReactNode;
  children: ReactNode;
};

export function FormPaper({
  children,
  title,
  subtitle,
  Icon,
  action,
}: FormPaperProps) {
  return (
    <Paper
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Icon color="action" />
            <Typography variant="h6">{title}</Typography>
          </Box>
          <Typography variant="subtitle1">{subtitle}</Typography>
        </Box>
        {action}
      </Box>

      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        {children}
      </Box>
    </Paper>
  );
}
