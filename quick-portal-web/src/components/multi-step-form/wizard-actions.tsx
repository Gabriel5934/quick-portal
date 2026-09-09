import Box from "@mui/material/Box";
import Button from "@mui/material/Button";

interface WizardActionsProps {
  onCancel: () => void;
  onBack?: () => void;
  submitLabel?: string;
  loading?: boolean;
}

export function WizardActions({
  onCancel,
  onBack,
  submitLabel = "Continuar",
  loading = false,
}: WizardActionsProps) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Button type="button" color="error" variant="outlined" onClick={onCancel}>
        Cancelar
      </Button>
      <Box sx={{ display: "flex", gap: 1 }}>
        {onBack && (
          <Button type="button" variant="outlined" onClick={onBack}>
            Voltar
          </Button>
        )}
        <Button type="submit" variant="contained" loading={loading}>
          {submitLabel}
        </Button>
      </Box>
    </Box>
  );
}
