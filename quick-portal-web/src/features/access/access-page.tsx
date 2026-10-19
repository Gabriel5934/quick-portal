import { useState } from "react";
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
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
  useBusinessInvites,
  useBusinessMemberships,
  useRevokeAccess,
  useUpdateAccessRole,
} from "#hooks/quickApi/useBusinessAccess";
import type { BusinessRole } from "#hooks/quickApi/useBusinesses";
import { getUserEmail } from "#hooks/storage";
import { useBusinessScope } from "../../layout/business-context";
import { InviteDialog, UnregisteredEmailAlert } from "./invite-dialog";
import { ROLE_LABELS, ROLES } from "./roles";
import type { AccessRow, BusinessInvite } from "./types";

function AccessStatus({ row }: { row: AccessRow }) {
  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
      {row.kind === "membership" ? (
        <Chip label="Ativo" color="success" size="small" />
      ) : (
        <Chip label="Convite pendente" color="warning" size="small" />
      )}
      {row.registered ? null : (
        <Chip
          label="Não cadastrado"
          color="error"
          variant="outlined"
          size="small"
        />
      )}
    </Stack>
  );
}

export function AccessPage() {
  const { business } = useBusinessScope();
  const businessId = business?.id;
  const memberships = useBusinessMemberships(businessId);
  const invites = useBusinessInvites(businessId);
  const updateRole = useUpdateAccessRole(businessId);
  const revoke = useRevokeAccess(businessId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [created, setCreated] = useState<BusinessInvite | null>(null);
  const [revoking, setRevoking] = useState<AccessRow | null>(null);
  const currentEmail = getUserEmail();

  const rows: AccessRow[] = [
    ...(memberships.data ?? []).map((membership) => ({
      kind: "membership" as const,
      id: membership.id,
      email: membership.email,
      role: membership.role,
      registered: true,
    })),
    ...(invites.data ?? []).map((invite) => ({
      kind: "invite" as const,
      id: invite.id,
      email: invite.email,
      role: invite.role,
      registered: invite.registered,
    })),
  ];
  const isLoading = memberships.isLoading || invites.isLoading;
  const loadError = memberships.error ?? invites.error;
  const mutationError = updateRole.error ?? revoke.error;
  const isSelf = (row: AccessRow) =>
    row.kind === "membership" && row.email.toLowerCase() === currentEmail;

  const changeRole = (row: AccessRow, role: BusinessRole) => {
    revoke.reset();
    updateRole.mutate({ kind: row.kind, id: row.id, role });
  };

  const confirmRevoke = () => {
    if (!revoking) return;
    updateRole.reset();
    revoke.mutate(
      { kind: revoking.kind, id: revoking.id },
      { onSettled: () => setRevoking(null) },
    );
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
          onClick={() => setInviteOpen(true)}
          disabled={!businessId}
          sx={{ whiteSpace: "nowrap" }}
        >
          Novo acesso
        </Button>
      </Box>

      <Stack spacing={2} sx={{ mb: 3 }}>
        {created ? (
          <Alert severity="success" onClose={() => setCreated(null)}>
            Convite enviado para {created.email} como{" "}
            {ROLE_LABELS[created.role].toLowerCase()}.
          </Alert>
        ) : null}
        {created && !created.registered ? <UnregisteredEmailAlert /> : null}
        {mutationError ? (
          <Alert severity="error">{mutationError.message}</Alert>
        ) : null}
      </Stack>

      <Paper variant="outlined">
        {loadError ? (
          <Typography color="error" sx={{ textAlign: "center", py: 6 }}>
            {loadError.message}
          </Typography>
        ) : isLoading ? (
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
                  <TableCell sx={{ width: 260 }}>Situação</TableCell>
                  <TableCell align="right" sx={{ width: 64 }}>
                    Ações
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length ? (
                  rows.map((row) => (
                    <TableRow key={`${row.kind}-${row.id}`} hover>
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
                          disabled={updateRole.isPending}
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
                      <TableCell>
                        <AccessStatus row={row} />
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Revogar acesso">
                          <IconButton
                            aria-label={`Revogar acesso de ${row.email}`}
                            onClick={() => setRevoking(row)}
                          >
                            <PersonRemoveOutlinedIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
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
        <InviteDialog
          businessId={businessId}
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          onCreated={(invite) => {
            updateRole.reset();
            revoke.reset();
            setCreated(invite);
          }}
        />
      ) : null}

      <Dialog open={revoking !== null} onClose={() => setRevoking(null)}>
        <DialogTitle>Revogar acesso?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {revoking?.kind === "invite"
              ? `O convite para ${revoking.email} será cancelado.`
              : `${revoking?.email ?? ""} deixará de acessar esta empresa.`}
            {revoking && isSelf(revoking)
              ? " Você perderá o acesso a esta empresa."
              : ""}
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
