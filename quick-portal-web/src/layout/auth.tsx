import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import logo from "../assets/quick-digital-logo.svg";

type AuthLayoutProps = {
  title: string;
  children: ReactNode;
};

export function AuthLayout({ title, children }: AuthLayoutProps) {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}
    >
      <Paper
        elevation={2}
        sx={(theme) => ({
          width: 1,
          maxWidth: { md: theme.spacing(50) },
          p: { xs: 3, md: 4 },
        })}
      >
        <img src={logo} alt="Quick Digital" />
        <Typography component="h1" variant="h5" gutterBottom>
          {title}
        </Typography>
        {children}
      </Paper>
    </Box>
  );
}
