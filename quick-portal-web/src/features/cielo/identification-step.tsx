import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { Business } from "#hooks/quickApi/useBusinesses";
import { useCieloCnpj } from "#hooks/brasilApi/useCieloCnpj";
import { useCieloOptions } from "#hooks/quickApi/useCielo";
import { FormFieldPaper } from "../../components/multi-step-form";
import type { CieloBusinessFormValues } from "./types";
import { isValidCnpj, isValidCpf, normalizeDocument } from "./validators";

export function CieloIdentificationStep({ business }: { business: Business }) {
  const {
    control,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useFormContext<CieloBusinessFormValues>();
  const documentType = business.document_type;
  const canonicalDocument = normalizeDocument(business.document, documentType);
  const validDocument =
    documentType === "CPF"
      ? isValidCpf(canonicalDocument)
      : isValidCnpj(canonicalDocument);
  const validCnpj = documentType === "CNPJ" && isValidCnpj(canonicalDocument);
  const validPhone = /^\d{11}$/.test(business.phone);
  const validEmail = business.email.length <= 50;
  const validCpfName = documentType !== "CPF" || business.name.length <= 50;
  const businessError = !validDocument
    ? `${documentType} inválido`
    : !validPhone || !validEmail || !validCpfName
      ? "Os dados cadastrais do estabelecimento são inválidos para a Cielo."
      : null;
  const { data: activities = [] } = useCieloOptions(
    "business-activities",
    documentType === "CPF",
  );
  const {
    data: cnpj,
    error: cnpjError,
    isFetching: isCnpjLoading,
  } = useCieloCnpj(canonicalDocument, validCnpj);
  const cnpjMessage = cnpjError
    ? cnpjError instanceof Error
      ? cnpjError.message
      : "Falha ao consultar o CNPJ na BrasilAPI"
    : isCnpjLoading
      ? "Consultando dados do CNPJ..."
      : errors.corporateName?.message;

  useEffect(() => {
    setValue("corporateName", "");
    setValue("fancyName", "");
  }, [canonicalDocument, documentType, setValue]);

  useEffect(() => {
    if (!cnpj) return;
    setValue("corporateName", cnpj.razao_social, { shouldValidate: true });
    setValue("fancyName", cnpj.nome_fantasia, { shouldValidate: true });
    clearErrors("corporateName");
  }, [clearErrors, cnpj, setValue]);

  useEffect(() => {
    if (!cnpjError) return;
    setError("corporateName", {
      type: "manual",
      message:
        cnpjError instanceof Error
          ? cnpjError.message
          : "Falha ao consultar o CNPJ na BrasilAPI",
    });
  }, [cnpjError, setError]);

  return (
    <FormFieldPaper
      title="Identificação"
      description="Informe os dados específicos exigidos pela Cielo."
      error={
        !!errors.contactName ||
        !validDocument ||
        !validPhone ||
        !validEmail ||
        !validCpfName ||
        !!errors.corporateName
      }
      required
    >
      <Stack spacing={2}>
        {businessError ? <Alert severity="error">{businessError}</Alert> : null}
        {!businessError && documentType === "CNPJ" && cnpjMessage ? (
          <Alert severity={cnpjError ? "error" : "info"}>{cnpjMessage}</Alert>
        ) : null}
        {documentType === "CPF" ? null : (
          <Controller
            name="contactName"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Nome do contato responsável"
                required
                error={!!errors.contactName}
                helperText={errors.contactName?.message}
              />
            )}
          />
        )}
        <Controller
          name="website"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="Website"
              error={!!errors.website}
              helperText={errors.website?.message}
            />
          )}
        />
        {documentType === "CPF" ? (
          <>
            <Controller
              name="birthdayDate"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  type="date"
                  label="Data de nascimento"
                  required
                  error={!!errors.birthdayDate}
                  helperText={errors.birthdayDate?.message}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              )}
            />
            <Controller
              name="businessActivityId"
              control={control}
              render={({ field: { onChange, value, ref } }) => (
                <Autocomplete
                  options={activities}
                  getOptionLabel={(option) =>
                    `${option.value} - ${option.label}`
                  }
                  isOptionEqualToValue={(option, selected) =>
                    option.value === selected.value
                  }
                  value={
                    activities.find((option) => option.value === value) ?? null
                  }
                  onChange={(_, selected) => onChange(selected?.value ?? "")}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      inputRef={ref}
                      label="Ramo de atividade"
                      required
                      error={!!errors.businessActivityId}
                      helperText={errors.businessActivityId?.message}
                    />
                  )}
                />
              )}
            />
          </>
        ) : null}
      </Stack>
    </FormFieldPaper>
  );
}
