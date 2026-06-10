import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Link as RouterLink, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

type BreadcrumbItem = {
  to: LinkProps["to"];
  label: string;
};

type FormPageProps = {
  breadcrumbs: BreadcrumbItem[];
  currentLabel: string;
  title: string;
  subtitle?: string;
  step?: { current: number; total: number };
  children: ReactNode;
};

export function FormPage({
  breadcrumbs,
  currentLabel,
  title,
  subtitle,
  step,
  children,
}: FormPageProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        height: "100%",
        justifyContent: "space-between",
      }}
    >
      <Box>
        <Breadcrumbs aria-label="breadcrumb">
          {breadcrumbs.map((item) => (
            <Link
              key={item.label}
              component={RouterLink}
              to={item.to}
              underline="hover"
              color="inherit"
            >
              {item.label}
            </Link>
          ))}
          <Typography color="text.primary" aria-current="page">
            {currentLabel}
          </Typography>
        </Breadcrumbs>

        <Typography variant="h5">{title}</Typography>
        {subtitle && <Typography variant="subtitle1">{subtitle}</Typography>}
        {step && (
          <Typography variant="subtitle2">
            Etapa {step.current} de {step.total}
          </Typography>
        )}
      </Box>

      {children}
    </Box>
  );
}
