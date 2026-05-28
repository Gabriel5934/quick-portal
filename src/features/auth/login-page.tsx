import { useCallback, useState } from "react";
import { AuthLayout } from "../../layout/auth";
import { LoginForm } from "./LoginForm";
import type { LoginFormValues } from "./types";
import Typography from "@mui/material/Typography";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import Link from "@mui/material/Link";
import { useToken } from "../../hooks/useToken";

export function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const tokenMutation = useToken();
  const navigate = useNavigate();

  const handleLogin = useCallback(
    async (data: LoginFormValues) => {
      setServerError(null);

      try {
        const tokens = await tokenMutation.mutateAsync(data);
        localStorage.setItem("token", tokens.access);
        localStorage.setItem("refreshToken", tokens.token);
        await navigate({ to: "/home" });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to log in. Please try again.";
        setServerError(message);
      }
    },
    [navigate, tokenMutation],
  );

  return (
    <AuthLayout title="Log in">
      <LoginForm
        onSubmit={handleLogin}
        isLoading={tokenMutation.isPending}
        serverError={serverError}
      />
      <Typography variant="body2" sx={{ mt: 2 }}>
        Don't have an account?{" "}
        <Link component={RouterLink} to="/signup" variant="body2">
          Sign up
        </Link>
      </Typography>
    </AuthLayout>
  );
}
