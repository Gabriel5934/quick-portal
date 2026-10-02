import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Controller, useFormContext } from "react-hook-form";
import { NumericFormat } from "react-number-format";
import {
  CIELO_METHOD_LABELS,
  CIELO_RATE_ROWS,
  installmentsLabel,
  rateRowLabel,
} from "./rates";
import type { CieloCardBrand, CieloPlanFormValues } from "./types";

export type RateAccordionState = "incomplete" | "complete" | "error";

const STATE_CHIPS: Record<
  RateAccordionState,
  { label: string; color: "default" | "success" | "error" }
> = {
  incomplete: { label: "Incompleto", color: "default" },
  complete: { label: "Completo", color: "success" },
  error: { label: "Com erros", color: "error" },
};

// Stable elements, so MUI's InputBase does not re-sync its FormControl's
// adornment state on every render.
const ADORNMENTS = {
  mdr: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
  fixed_fee: {
    startAdornment: <InputAdornment position="start">R$</InputAdornment>,
  },
};

interface RateInputProps {
  brand: CieloCardBrand;
  index: number;
  field: "mdr" | "fixed_fee";
  label: string;
  revalidate: boolean;
}

function RateInput({ brand, index, field: key, label, revalidate }: RateInputProps) {
  const { control, trigger } = useFormContext<CieloPlanFormValues>();
  const name = `rates.${brand}.${index}.${key}` as const;
  const adornment = ADORNMENTS[key];

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <NumericFormat
          customInput={TextField}
          name={field.name}
          inputRef={field.ref}
          value={field.value}
          valueIsNumericString
          decimalSeparator=","
          decimalScale={2}
          allowNegative={false}
          onValueChange={({ value }, { event }) => {
            // Only typing changes the form; value prop updates have no event.
            if (!event) return;
            field.onChange(value);
            // Once "Concluir" validated this brand, keep its state current.
            if (revalidate) void trigger(name);
          }}
          onBlur={field.onBlur}
          size="small"
          error={!!fieldState.error}
          helperText={fieldState.error?.message}
          slotProps={{ input: adornment, htmlInput: { "aria-label": label } }}
          sx={{ width: 150 }}
        />
      )}
    />
  );
}

interface RateAccordionProps {
  brand: CieloCardBrand;
  expanded: boolean;
  state: RateAccordionState;
  onExpandedChange: (expanded: boolean) => void;
  onConclude: () => void;
}

export function RateAccordion({
  brand,
  expanded,
  state,
  onExpandedChange,
  onConclude,
}: RateAccordionProps) {
  const chip = STATE_CHIPS[state];
  const summaryId = `cielo-plan-rates-${brand}`;

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, isExpanded) => onExpandedChange(isExpanded)}
      variant="outlined"
      disableGutters
      slotProps={{ transition: { unmountOnExit: true } }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        id={summaryId}
        aria-controls={`${summaryId}-content`}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Typography sx={{ fontWeight: 600 }}>{brand}</Typography>
          <Chip
            size="small"
            label={chip.label}
            color={chip.color}
            aria-label={`${brand}: ${chip.label}`}
          />
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <TableContainer>
          <Table size="small" aria-label={`Taxas ${brand}`}>
            <TableHead>
              <TableRow>
                <TableCell>Forma de pagamento</TableCell>
                <TableCell>Parcelas</TableCell>
                <TableCell>MDR</TableCell>
                <TableCell>Taxa fixa</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {CIELO_RATE_ROWS.map((row, index) => (
                <TableRow key={rateRowLabel(row)}>
                  <TableCell>{CIELO_METHOD_LABELS[row.method]}</TableCell>
                  <TableCell>{installmentsLabel(row.installments)}</TableCell>
                  <TableCell>
                    <RateInput
                      brand={brand}
                      index={index}
                      field="mdr"
                      label={`MDR ${brand} ${rateRowLabel(row)}`}
                      revalidate={state !== "incomplete"}
                    />
                  </TableCell>
                  <TableCell>
                    <RateInput
                      brand={brand}
                      index={index}
                      field="fixed_fee"
                      label={`Taxa fixa ${brand} ${rateRowLabel(row)}`}
                      revalidate={state !== "incomplete"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
          <Button variant="contained" onClick={onConclude}>
            Concluir
          </Button>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
