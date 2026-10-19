import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import {
  useAcceptInvite,
  useDeclineInvite,
  useReceivedInvites,
} from "#hooks/quickApi/useBusinessAccess";
import { useBusinessSelection } from "../../layout/business-selection";
import { ROLE_LABELS } from "./roles";
import type { ReceivedInvite } from "./types";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

function InviteCard({ invite }: { invite: ReceivedInvite }) {
  const navigate = useNavigate();
  const { selectBusiness } = useBusinessSelection();
  const accept = useAcceptInvite();
  const decline = useDeclineInvite();
  const businessName = invite.business.trade_name || invite.business.name;
  const error = accept.error ?? decline.error;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ alignItems: { xs: "stretch", sm: "center" } }}
      >
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
            {businessName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Papel: {ROLE_LABELS[invite.role]}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {invite.invited_by_email
              ? `Convidado por ${invite.invited_by_email} em ${formatDate(invite.created_at)}`
              : `Convidado em ${formatDate(invite.created_at)}`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          <Button
            variant="outlined"
            color="inherit"
            loading={decline.isPending}
            disabled={accept.isPending}
            onClick={() => decline.mutate(invite.id)}
          >
            Recusar
          </Button>
          <Button
            variant="contained"
            loading={accept.isPending}
            disabled={decline.isPending}
            onClick={() =>
              accept.mutate(invite.id, {
                onSuccess: () => {
                  selectBusiness(invite.business.id);
                  void navigate({ to: "/sales" });
                },
              })
            }
          >
            Aceitar
          </Button>
        </Stack>
      </Stack>
      {error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error.message}
        </Alert>
      ) : null}
    </Paper>
  );
}

export function ReceivedInvitesPage() {
  const { data: invites, error, isLoading } = useReceivedInvites();

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" sx={{ fontWeight: "bold" }}>
          Convites
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Empresas que concederam acesso ao seu e-mail
        </Typography>
      </Box>
      {error ? (
        <Alert severity="error">{error.message}</Alert>
      ) : isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress aria-label="Carregando convites" />
        </Box>
      ) : invites?.length ? (
        <Stack spacing={2}>
          {invites.map((invite) => (
            <InviteCard key={invite.id} invite={invite} />
          ))}
        </Stack>
      ) : (
        <Paper variant="outlined" sx={{ py: 6, textAlign: "center" }}>
          <Typography color="text.secondary">
            Nenhum convite pendente
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
