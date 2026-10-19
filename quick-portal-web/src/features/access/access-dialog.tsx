import { useEffect, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import {
  AccessRequestError,
  useEmailStatus,
  useGrantAccess,
} from "#hooks/quickApi/useBusinessAccess";
import { ROLE_LABELS, ROLES } from "./roles";
import { accessSchema, type AccessFormValues } from "./schemas";
import type { AccessRow } from "./types";

const EMAIL_CHECK_DELAY_MS = 400;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

/** The email to check, or `null` while it is not a valid address. */
function checkableEmail(email: string): string | null {
  const result = accessSchema.shape.email.safeParse(email);
  return result.success ? result.data.toLowerCase() : null;
}

export function UnregisteredEmailAlert() {
  return (
    <Alert severity="warning">
      <AlertTitle>E-mail não cadastrado</AlertTitle>
      Ninguém criou uma conta no Portal Quick com este e-mail ainda. A empresa
      aparecerá para a pessoa assim que ela se cadastrar com ele.
    </Alert>
  );
}

interface AccessDialogProps {
  businessId: number;
  open: boolean;
  onClose: () => void;
  onGranted: (access: AccessRow) => void;
}

export function AccessDialog({
  businessId,
  open,
  onClose,
  onGranted,
}: AccessDialogProps) {
  const grantAccess = useGrantAccess(businessId);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AccessFormValues>({
    resolver: zodResolver(accessSchema),
    defaultValues: { email: "", role: "VIEWER" },
  });
  const email = useWatch({ control, name: "email" });
  const debouncedEmail = useDebouncedValue(
    checkableEmail(email),
    EMAIL_CHECK_DELAY_MS,
  );
  // Only trust the status of the email currently typed.
  const emailStatus = useEmailStatus(businessId, debouncedEmail);
  const unregistered =
    emailStatus.data !== undefined &&
    emailStatus.data.email === checkableEmail(email) &&
    !emailStatus.data.registered;

  const close = () => {
    reset();
    grantAccess.reset();
    onClose();
  };

  const submit = handleSubmit((values) => {
    grantAccess.mutate(values, {
      onSuccess: (access) => {
        onGranted(access);
        close();
      },
      onError: (error) => {
        const body = error instanceof AccessRequestError ? error.body : null;
        const fieldErrors = body as Partial<
          Record<"email" | "role", string[]>
        > | null;
        for (const field of ["email", "role"] as const) {
          const message = fieldErrors?.[field]?.[0];
          if (message) setError(field, { message });
        }
      },
    });
  });

  const fieldError =
    grantAccess.error instanceof AccessRequestError &&
    grantAccess.error.body !== null &&
    typeof grantAccess.error.body === "object" &&
    ("email" in grantAccess.error.body || "role" in grantAccess.error.body);

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <Box
        component="form"
        noValidate
        onSubmit={(event: FormEvent) => void submit(event)}
      >
        <DialogTitle>Novo acesso</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <TextField
              label="E-mail"
              type="email"
              autoFocus
              fullWidth
              {...register("email")}
              error={!!errors.email}
              helperText={
                errors.email?.message ??
                "A empresa aparecerá no seletor de perfil da pessoa."
              }
            />
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <TextField
                  select
                  label="Papel"
                  fullWidth
                  {...field}
                  error={!!errors.role}
                  helperText={errors.role?.message}
                >
                  {ROLES.map((role) => (
                    <MenuItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            {unregistered ? <UnregisteredEmailAlert /> : null}
            {grantAccess.error && !fieldError ? (
              <Alert severity="error">{grantAccess.error.message}</Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close}>Cancelar</Button>
          <Button
            type="submit"
            variant="contained"
            loading={grantAccess.isPending}
          >
            Conceder acesso
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
