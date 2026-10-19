import { useState } from "react";
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import {
  useBusinessMemberships,
  useRevokeMembership,
  useUpdateMembershipRole,
} from "#hooks/quickApi/useBusinessAccess";
import type { BusinessRole } from "#hooks/quickApi/useBusinesses";
import { getUserEmail } from "#hooks/storage";
import { useBusinessScope } from "../../layout/business-context";
import { AccessDialog } from "./access-dialog";
import { ROLE_LABELS, ROLES } from "./roles";
import type { BusinessMembership } from "./types";

export function AccessPage() {
  const { business } = useBusinessScope();
  const businessId = business?.id;
  const memberships = useBusinessMemberships(businessId);
  const updateRole = useUpdateMembershipRole(businessId);
  const revoke = useRevokeMembership(businessId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [granted, setGranted] = useState<BusinessMembership | null>(null);
  const [revoking, setRevoking] = useState<BusinessMembership | null>(null);
  const currentEmail = getUserEmail();

  const rows = memberships.data ?? [];
  const mutationError = updateRole.error ?? revoke.error;
  const isSelf = (row: BusinessMembership) =>
    row.email.toLowerCase() === currentEmail;
  const isAdmin = (row: BusinessMembership) => row.role === "ADMIN";
  // The API refuses to demote or remove the final admin.
  const isFinalAdmin = (row: BusinessMembership) =>
    isAdmin(row) && rows.filter(isAdmin).length === 1;
  const canRevoke = (row: BusinessMembership) =>
    !isSelf(row) && !isFinalAdmin(row);

  const changeRole = (row: BusinessMembership, role: BusinessRole) => {
    revoke.reset();
    updateRole.mutate({ id: row.id, role });
  };

  const confirmRevoke = () => {
    if (!revoking) return;
    updateRole.reset();
    revoke.mutate(revoking.id, { onSettled: () => setRevoking(null) });
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: { xs: "stretch", sm: "center" },
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          gap: 2,
          mb: 4,
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: "bold" }}>
            Acessos
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Pessoas que podem acessar
            {business
              ? ` ${business.trade_name || business.name}`
              : " a empresa"}
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="large"
          startIcon={<PersonAddAlt1Icon />}
          onClick={() => setDialogOpen(true)}
          disabled={!businessId}
          sx={{ whiteSpace: "nowrap" }}
        >
          Novo acesso
        </Button>
      </Box>

      <Stack spacing={2} sx={{ mb: 3 }}>
        {granted ? (
          <Alert severity="success" onClose={() => setGranted(null)}>
            Acesso concedido a {granted.email} como{" "}
            {ROLE_LABELS[granted.role].toLowerCase()}.
          </Alert>
        ) : null}
        {mutationError ? (
          <Alert severity="error">{mutationError.message}</Alert>
        ) : null}
      </Stack>

      <Paper variant="outlined">
        {memberships.error ? (
          <Typography color="error" sx={{ textAlign: "center", py: 6 }}>
            {memberships.error.message}
          </Typography>
        ) : memberships.isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress aria-label="Carregando acessos" />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small" aria-label="Acessos">
              <TableHead>
                <TableRow>
                  <TableCell>E-mail</TableCell>
                  <TableCell sx={{ width: 200 }}>Papel</TableCell>
                  <TableCell align="right" sx={{ width: 64 }}>
                    Ações
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length ? (
                  rows.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell sx={{ wordBreak: "break-all" }}>
                        {row.email}
                        {isSelf(row) ? (
                          <Typography
                            component="span"
                            variant="body2"
                            color="text.secondary"
                          >
                            {" "}
                            (você)
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          variant="standard"
                          size="small"
                          fullWidth
                          value={row.role}
                          disabled={updateRole.isPending || isFinalAdmin(row)}
                          onChange={(event) =>
                            changeRole(row, event.target.value as BusinessRole)
                          }
                          slotProps={{
                            htmlInput: {
                              "aria-label": `Papel de ${row.email}`,
                            },
                          }}
                        >
                          {ROLES.map((role) => (
                            <MenuItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell align="right">
                        {canRevoke(row) ? (
                          <Tooltip title="Revogar acesso">
                            <IconButton
                              aria-label={`Revogar acesso de ${row.email}`}
                              onClick={() => setRevoking(row)}
                            >
                              <PersonRemoveOutlinedIcon />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 6 }}>
                      <Typography color="text.secondary">
                        Nenhum acesso concedido
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {businessId ? (
        <AccessDialog
          businessId={businessId}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onGranted={(row) => {
            updateRole.reset();
            revoke.reset();
            setGranted(row);
          }}
        />
      ) : null}

      <Dialog open={revoking !== null} onClose={() => setRevoking(null)}>
        <DialogTitle>Revogar acesso?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {`${revoking?.email ?? ""} deixará de acessar esta empresa.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevoking(null)}>Cancelar</Button>
          <Button
            color="error"
            variant="contained"
            loading={revoke.isPending}
            onClick={confirmRevoke}
          >
            Revogar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
