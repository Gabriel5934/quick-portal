import type { FormEvent } from "react";
import Alert from "@mui/material/Alert";
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
import { Controller, useForm } from "react-hook-form";
import {
  AccessRequestError,
  useGrantAccess,
} from "#hooks/quickApi/useBusinessAccess";
import { ROLE_LABELS, ROLES } from "./roles";
import { accessSchema, type AccessFormValues } from "./schemas";
import type { BusinessMembership } from "./types";

const FIELDS = ["email", "role"] as const;
type FieldErrors = Partial<Record<(typeof FIELDS)[number], string[]>>;

/** DRF field errors in `error`, or `null` when it carries none. */
function fieldErrors(error: Error | null): FieldErrors | null {
  if (!(error instanceof AccessRequestError)) return null;
  const body = error.body;
  if (!body || typeof body !== "object") return null;
  return FIELDS.some((field) => field in body) ? body : null;
}

interface AccessDialogProps {
  businessId: number;
  open: boolean;
  onClose: () => void;
  onGranted: (membership: BusinessMembership) => void;
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

  const close = () => {
    reset();
    grantAccess.reset();
    onClose();
  };

  const submit = handleSubmit((values) => {
    grantAccess.mutate(values, {
      onSuccess: (membership) => {
        onGranted(membership);
        close();
      },
      onError: (error) => {
        const apiErrors = fieldErrors(error);
        for (const field of FIELDS) {
          const message = apiErrors?.[field]?.[0];
          if (message) setError(field, { message });
        }
      },
    });
  });

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
                "Use o e-mail com que a pessoa se cadastrou no Portal Quick."
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
            {grantAccess.error && !fieldErrors(grantAccess.error) ? (
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
