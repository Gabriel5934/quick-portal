import Stack from "@mui/material/Stack";
import type { FormEventHandler, ReactNode } from "react";

export function StepForm({
  onSubmit,
  children,
}: {
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {
  return (
    <Stack component="form" noValidate spacing={2} onSubmit={onSubmit}>
      {children}
    </Stack>
  );
}
