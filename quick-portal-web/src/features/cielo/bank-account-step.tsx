import Autocomplete from "@mui/material/Autocomplete";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import Grid from "@mui/material/Grid";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { useCieloOptions } from "#hooks/quickApi/useCielo";
import {
  DerivedTextField,
  FormFieldPaper,
} from "../../components/multi-step-form";
import type { CieloBusinessFormValues } from "./types";
import { formatDocument, normalizeDocument } from "./validators";

export function CieloBankAccountStep({ business }: { business: Business }) {
  const {
    control,
    setValue,
    clearErrors,
    formState: { errors },
  } = useFormContext<CieloBusinessFormValues>();
  const bankDocumentType = useWatch({ control, name: "bankDocumentType" });
  const sameBankDocument = useWatch({ control, name: "sameBankDocument" });
  const { data: banks = [] } = useCieloOptions("banks");
  const { data: accountTypes = [] } = useCieloOptions("bank-account-types");
  const { data: documentTypes = [] } = useCieloOptions("document-types");

  return (
    <FormFieldPaper
      title="Conta bancária"
      description="Informe a conta e o documento do titular."
      error={
        !!errors.bank ||
        !!errors.bankAccountType ||
        !!errors.bankAccountNumber ||
        !!errors.bankAccountVerifierDigit ||
        !!errors.bankAgencyNumber ||
        !!errors.bankAgencyDigit ||
        !!errors.bankDocumentNumber
      }
      required
    >
      <Stack spacing={2}>
        <Controller
          name="bank"
          control={control}
          render={({ field: { onChange, value, ref } }) => (
            <Autocomplete
              options={banks}
              getOptionLabel={(option) => `${option.value} - ${option.label}`}
              isOptionEqualToValue={(option, selected) =>
                option.value === selected.value
              }
              value={banks.find((option) => option.value === value) ?? null}
              onChange={(_, selected) => onChange(selected?.value ?? "")}
              renderInput={(params) => (
                <TextField
                  {...params}
                  inputRef={ref}
                  label="Banco"
                  required
                  error={!!errors.bank}
                  helperText={errors.bank?.message}
                />
              )}
            />
          )}
        />

        <Controller
          name="bankAccountType"
          control={control}
          render={({ field }) => (
            <FormControl error={!!errors.bankAccountType} required>
              <FormLabel id="bank-account-type-label">Tipo de conta</FormLabel>
              <RadioGroup
                {...field}
                row
                aria-labelledby="bank-account-type-label"
              >
                {accountTypes.map((option) => (
                  <FormControlLabel
                    key={option.value}
                    value={option.value}
                    control={<Radio />}
                    label={option.label}
                  />
                ))}
              </RadioGroup>
              {errors.bankAccountType ? (
                <FormHelperText>
                  {errors.bankAccountType.message}
                </FormHelperText>
              ) : null}
            </FormControl>
          )}
        />

        <Grid container spacing={2}>
          <Grid size={{ xs: 9, sm: 10 }}>
            <Controller
              name="bankAccountNumber"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Número da conta"
                  required
                  error={!!errors.bankAccountNumber}
                  helperText={errors.bankAccountNumber?.message}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 3, sm: 2 }}>
            <Controller
              name="bankAccountVerifierDigit"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Dígito"
                  required
                  error={!!errors.bankAccountVerifierDigit}
                  helperText={errors.bankAccountVerifierDigit?.message}
                />
              )}
            />
          </Grid>
        </Grid>

        <Grid container spacing={2}>
          <Grid size={{ xs: 9, sm: 10 }}>
            <Controller
              name="bankAgencyNumber"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Agência"
                  required
                  error={!!errors.bankAgencyNumber}
                  helperText={errors.bankAgencyNumber?.message}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 3, sm: 2 }}>
            <Controller
              name="bankAgencyDigit"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Dígito"
                  error={!!errors.bankAgencyDigit}
                  helperText={errors.bankAgencyDigit?.message}
                />
              )}
            />
          </Grid>
        </Grid>

        <Controller
          name="sameBankDocument"
          control={control}
          render={({ field: { value, onChange, ...field } }) => (
            <FormControlLabel
              control={
                <Switch
                  {...field}
                  checked={value}
                  onChange={(_, checked) => {
                    onChange(checked);
                    if (!checked) {
                      setValue("bankDocumentNumber", "", {
                        shouldDirty: true,
                        shouldValidate: false,
                      });
                      clearErrors("bankDocumentNumber");
                      return;
                    }
                    setValue("bankDocumentType", business.document_type, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setValue(
                      "bankDocumentNumber",
                      normalizeDocument(
                        business.document,
                        business.document_type,
                      ),
                      { shouldDirty: true, shouldValidate: true },
                    );
                    clearErrors(["bankDocumentType", "bankDocumentNumber"]);
                  }}
                />
              }
              label="Usar o mesmo documento do estabelecimento"
            />
          )}
        />

        {!sameBankDocument ? (
          <Controller
            name="bankDocumentType"
            control={control}
            render={({ field: { onChange, ...field } }) => (
              <FormControl required>
                <FormLabel id="bank-document-type-label">
                  Tipo de documento do titular
                </FormLabel>
                <RadioGroup
                  {...field}
                  row
                  aria-labelledby="bank-document-type-label"
                  onChange={(event) => {
                    onChange(event);
                    setValue("bankDocumentNumber", "", {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    clearErrors("bankDocumentNumber");
                  }}
                >
                  {documentTypes.map((option) => (
                    <FormControlLabel
                      key={option.value}
                      value={option.value}
                      control={<Radio />}
                      label={option.label}
                    />
                  ))}
                </RadioGroup>
              </FormControl>
            )}
          />
        ) : null}

        <Controller
          name="bankDocumentNumber"
          control={control}
          render={({ field }) =>
            sameBankDocument ? (
              <DerivedTextField
                {...field}
                value={formatDocument(field.value, bankDocumentType)}
                label={`${bankDocumentType} do titular`}
                loading={false}
                required
                error={!!errors.bankDocumentNumber}
                helperText={errors.bankDocumentNumber?.message}
              />
            ) : (
              <TextField
                {...field}
                label={`${bankDocumentType} do titular`}
                required
                value={formatDocument(field.value, bankDocumentType)}
                onChange={(event) =>
                  field.onChange(
                    formatDocument(event.target.value, bankDocumentType),
                  )
                }
                error={!!errors.bankDocumentNumber}
                helperText={errors.bankDocumentNumber?.message}
                slotProps={{
                  htmlInput: {
                    maxLength: bankDocumentType === "CPF" ? 14 : 18,
                  },
                }}
              />
            )
          }
        />
      </Stack>
    </FormFieldPaper>
  );
}
