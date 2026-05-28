import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { useCallback, useState } from "react";
import { AuthLayout } from "../../layout/auth";
import { SignupForm } from "./SignupForm";
import type { SignupFormValues } from "./types";
import { useRegister } from "../../hooks/useRegister";

export function SignupPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const registerMutation = useRegister();
  const navigate = useNavigate();

  const handleSignup = useCallback(
    async (data: SignupFormValues) => {
      setServerError(null);

      try {
        await registerMutation.mutateAsync(data);
        await navigate({ to: "/" });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to sign up. Please try again.";
        setServerError(message);
      }
    },
    [navigate, registerMutation],
  );

  return (
    <AuthLayout title="Create account">
      <SignupForm
        onSubmit={handleSignup}
        isLoading={registerMutation.isPending}
        serverError={serverError}
      />
      <Typography variant="body2" sx={{ mt: 2 }}>
        Already have an account?{" "}
        <Link component={RouterLink} to="/login" variant="body2">
          Log in
        </Link>
      </Typography>
    </AuthLayout>
  );
}
