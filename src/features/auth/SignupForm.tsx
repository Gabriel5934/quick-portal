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
import { signupSchema } from "./schemas";
import type { SignupFormValues } from "./types";

export type SignupFormProps = {
  onSubmit: (data: SignupFormValues) => void | Promise<void>;
  isLoading?: boolean;
  serverError?: string | null;
};

export function SignupForm({
  onSubmit,
  isLoading = false,
  serverError = null,
}: SignupFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: { email: "", password: "", confirmPassword: "" },
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
        autoComplete="new-password"
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

      <TextField
        {...register("confirmPassword")}
        type={showConfirmPassword ? "text" : "password"}
        label="Confirm password"
        autoComplete="new-password"
        fullWidth
        required
        margin="normal"
        error={Boolean(errors.confirmPassword)}
        helperText={errors.confirmPassword?.message}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  type="button"
                  aria-label={
                    showConfirmPassword ? "Hide confirm password" : "Show confirm password"
                  }
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  edge="end"
                >
                  {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
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
          "Create account"
        )}
      </Button>
    </Box>
  );
}
