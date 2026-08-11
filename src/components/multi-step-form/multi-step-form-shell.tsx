import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { FormPage } from "../../layout/form-page";

interface MultiStepFormShellProps {
  title: string;
  subtitle: string;
  steps: readonly string[];
  currentStep: number;
  children: ReactNode;
}

export function MultiStepFormShell({
  title,
  subtitle,
  steps,
  currentStep,
  children,
}: MultiStepFormShellProps) {
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <FormPage
      breadcrumbs={[{ to: "/recurring-fees", label: "Taxas Recorrentes" }]}
      currentLabel={steps[currentStep]}
      title={title}
      subtitle={subtitle}
    >
      <Stack spacing={2.5}>
        <Box>
          <Box
            sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Etapa {currentStep + 1} de {steps.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {Math.round(progress)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progress}
            aria-label={`Etapa ${currentStep + 1} de ${steps.length}`}
          />
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 280px" },
            gap: 3,
            alignItems: "start",
          }}
        >
          <Box sx={{ minWidth: 0 }}>{children}</Box>
          <Paper
            variant="outlined"
            sx={{ p: 2.5, position: { lg: "sticky" }, top: { lg: 0 } }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
              Progresso
            </Typography>
            <Stepper activeStep={currentStep} orientation="vertical">
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </Paper>
        </Box>
      </Stack>
    </FormPage>
  );
}
