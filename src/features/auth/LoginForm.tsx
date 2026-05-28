import { zodResolver } from "@hookform/resolvers/zod";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { loginSchema } from "./schemas";
import type { LoginFormValues } from "./types";

export type LoginFormProps = {
  onSubmit: (data: LoginFormValues) => void | Promise<void>;
  isLoading?: boolean;
  serverError?: string | null;
};

export function LoginForm({
  onSubmit,
  isLoading = false,
  serverError = null,
}: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: { email: "", password: "" },
  });

  return (
    <Box
      component="form"
      onSubmit={(event) => {
        void handleSubmit(onSubmit)(event);
      }}
      noValidate
    >
      {serverError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {serverError}
        </Alert>
      ) : null}

      <TextField
        {...register("email")}
        type="email"
        label="Email"
        autoComplete="email"
        fullWidth
        required
        margin="normal"
        error={Boolean(errors.email)}
        helperText={errors.email?.message}
      />

      <TextField
        {...register("password")}
        type={showPassword ? "text" : "password"}
        label="Password"
        autoComplete="current-password"
        fullWidth
        required
        margin="normal"
        error={Boolean(errors.password)}
        helperText={errors.password?.message}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  edge="end"
                >
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />

      <Button
        type="submit"
        variant="contained"
        fullWidth
        disabled={isLoading}
        sx={{ mt: 2 }}
      >
        {isLoading ? (
          <CircularProgress size={24} color="inherit" aria-label="Submitting" />
        ) : (
          "Log in"
        )}
      </Button>
    </Box>
  );
}
