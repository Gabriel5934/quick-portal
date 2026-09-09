import TextField from "@mui/material/TextField";
import { NumericFormat } from "react-number-format";

interface CurrencyFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: boolean;
  helperText?: string;
  fullWidth?: boolean;
}

export function CurrencyField({
  label,
  value,
  onChange,
  onBlur,
  error = false,
  helperText,
  fullWidth = true,
}: CurrencyFieldProps) {
  return (
    <NumericFormat
      customInput={TextField}
      variant="standard"
      label={label}
      value={value}
      valueIsNumericString
      prefix="R$ "
      thousandSeparator="."
      decimalSeparator=","
      decimalScale={2}
      fixedDecimalScale
      allowNegative={false}
      onValueChange={({ value: numericValue }) => onChange(numericValue)}
      onBlur={onBlur}
      error={error}
      helperText={helperText}
      fullWidth={fullWidth}
    />
  );
}
