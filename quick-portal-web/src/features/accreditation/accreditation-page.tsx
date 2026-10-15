import { Alert, Box, Typography } from "@mui/material";
import { CieloBusinessPanel, CieloStatusCard } from "#features/cielo";

interface AccreditationPageProps {
  businessId: number | undefined;
}

/** Shows the selected business's Cielo accreditation. */
export function AccreditationPage({ businessId }: AccreditationPageProps) {
  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: "bold" }}>
          Credenciamento
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Acompanhe o credenciamento da empresa selecionada
        </Typography>
      </Box>

      {businessId === undefined ? (
        <Alert severity="info">Selecione uma empresa.</Alert>
      ) : (
        <>
          <CieloStatusCard businessId={businessId} />
          <CieloBusinessPanel businessId={businessId} />
        </>
      )}
    </Box>
  );
}
