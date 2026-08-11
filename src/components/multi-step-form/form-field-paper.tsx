import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

interface FormFieldPaperProps {
  title: string;
  description?: string;
  error?: boolean;
  required?: boolean;
  children: ReactNode;
}

export function FormFieldPaper({
  title,
  description,
  error = false,
  required = false,
  children,
}: FormFieldPaperProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        borderColor: error ? "error.main" : undefined,
        borderWidth: error ? 2 : undefined,
      }}
    >
      <Stack spacing={2}>
        <div>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
            {required && (
              <Typography
                component="span"
                color="error"
                aria-hidden="true"
                sx={{ ml: 0.5 }}
              >
                *
              </Typography>
            )}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          )}
        </div>
        {children}
      </Stack>
    </Paper>
  );
}
