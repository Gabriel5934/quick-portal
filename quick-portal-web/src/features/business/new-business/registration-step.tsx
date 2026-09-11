import FormControlLabel from "@mui/material/FormControlLabel";
import InputAdornment from "@mui/material/InputAdornment";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import RefreshOutlined from "@mui/icons-material/RefreshOutlined";
import { keyframes } from "@mui/material/styles";
import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { PatternFormat } from "react-number-format";
import { useCnpj } from "#hooks/brasilApi/useCnpj";
import { FormFieldPaper } from "../../../components/multi-step-form";
import { useBusinessScope } from "../../../layout/business-context";
import type { NewBusinessFormValues } from "./types";

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

function CnpjLoadingAdornment({ loading }: { loading: boolean }) {
  if (!loading) return null;

  return (
    <InputAdornment position="start">
      <RefreshOutlined
        aria-hidden="true"
        fontSize="small"
        sx={{ animation: `${spin} 1s linear infinite` }}
      />
    </InputAdornment>
  );
}

export function RegistrationStep() {
  const { business } = useBusinessScope();
  const {
    register,
    control,
    watch,
    setValue,
    clearErrors,
    getValues,
    reset,
    formState: { errors },
  } = useFormContext<NewBusinessFormValues>();

  const documentType = watch("documentType");
  const document = watch("document") ?? "";
  const name = watch("name") ?? "";
  const nomeFantasia = watch("nomeFantasia") ?? "";
  const isCnpj = documentType === "CNPJ";
  const isCpf = documentType === "CPF";
  const {
    data: cnpjData,
    error: cnpjError,
    isFetching: isCnpjLoading,
  } = useCnpj(document, isCnpj);
  const canCreateReseller = business?.type === "RESELLER";

  useEffect(() => {
    if (!cnpjData && !cnpjError) return;
    reset({
      ...getValues(),
      name: cnpjData?.razao_social ?? "",
      nomeFantasia: cnpjData?.nome_fantasia ?? "",
    });
  }, [cnpjData, cnpjError, reset, getValues]);

  useEffect(() => {
    if (!canCreateReseller) setValue("isReseller", false);
  }, [canCreateReseller, setValue]);

  const handleDocumentTypeChange = (
    fieldOnChange: (...event: unknown[]) => void,
  ) => {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      fieldOnChange(event);
      setValue("document", "");
      setValue("name", "");
      setValue("nomeFantasia", "");
      clearErrors(["document", "name", "nomeFantasia"]);
    };
  };

  return (
    <>
      {canCreateReseller && (
        <FormFieldPaper title="Você está cadastrando uma revenda?">
          <Controller
            name="isReseller"
            control={control}
            render={({ field: { value, onChange, ...field } }) => (
              <FormControlLabel
                control={
                  <Switch
                    {...field}
                    checked={value}
                    onChange={(_, checked) => onChange(checked)}
                  />
                }
                label="Revenda"
              />
            )}
          />
        </FormFieldPaper>
      )}

      <FormFieldPaper
        title="Documento"
        error={Boolean(errors.document)}
        required
      >
        <Controller
          name="documentType"
          control={control}
          render={({ field: { onChange, ...field } }) => (
            <RadioGroup
              {...field}
              row
              onChange={handleDocumentTypeChange(onChange)}
            >
              <FormControlLabel value="CNPJ" control={<Radio />} label="CNPJ" />
              <FormControlLabel value="CPF" control={<Radio />} label="CPF" />
            </RadioGroup>
          )}
        />
        <Controller
          name="document"
          control={control}
          render={({ field: { ref, onChange, value, ...field } }) => (
            <PatternFormat
              {...field}
              value={value}
              format={isCpf ? "###.###.###-##" : "##.###.###/####-##"}
              onValueChange={(values) => onChange(values.formattedValue)}
              customInput={TextField}
              getInputRef={ref}
              variant="standard"
              label={isCpf ? "CPF" : "CNPJ"}
              fullWidth
              required
              error={Boolean(errors.document)}
              helperText={errors.document?.message}
            />
          )}
        />
      </FormFieldPaper>

      {isCpf && (
        <FormFieldPaper
          title="Nome completo"
          description="Informe o nome do responsável pelo CPF."
          error={Boolean(errors.name)}
          required
        >
          <TextField
            {...register("name")}
            variant="standard"
            label="Nome Completo"
            fullWidth
            required
            error={Boolean(errors.name)}
            helperText={errors.name?.message}
          />
        </FormFieldPaper>
      )}

      {isCnpj && (
        <FormFieldPaper title="Dados cadastrais">
          <TextField
            variant="standard"
            label="Razão Social"
            value={name}
            fullWidth
            slotProps={{
              input: {
                readOnly: true,
                startAdornment: (
                  <CnpjLoadingAdornment loading={isCnpjLoading} />
                ),
              },
            }}
            disabled
          />
          <TextField
            variant="standard"
            label="Nome Fantasia"
            value={nomeFantasia}
            fullWidth
            slotProps={{
              input: {
                readOnly: true,
                startAdornment: (
                  <CnpjLoadingAdornment loading={isCnpjLoading} />
                ),
              },
            }}
            disabled
          />
        </FormFieldPaper>
      )}
    </>
  );
}
