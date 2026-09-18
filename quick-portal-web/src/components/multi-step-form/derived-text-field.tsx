import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import InputAdornment from "@mui/material/InputAdornment";
import TextField, { type TextFieldProps } from "@mui/material/TextField";
import { keyframes } from "@mui/material/styles";

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

type DerivedTextFieldProps = Omit<
  TextFieldProps,
  "disabled" | "slotProps" | "variant" | "fullWidth"
> & {
  loading: boolean;
};

export function DerivedTextField({ loading, ...props }: DerivedTextFieldProps) {
  return (
    <TextField
      {...props}
      variant="standard"
      fullWidth
      disabled
      slotProps={{
        input: {
          readOnly: true,
          startAdornment: loading ? (
            <InputAdornment
              position="start"
              role="status"
              aria-label="Carregando dados"
            >
              <RefreshOutlined
                aria-hidden="true"
                fontSize="small"
                sx={{ animation: `${spin} 1s linear infinite` }}
              />
            </InputAdornment>
          ) : null,
        },
      }}
    />
  );
}
