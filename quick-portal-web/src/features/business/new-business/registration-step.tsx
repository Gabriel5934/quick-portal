import Autocomplete from "@mui/material/Autocomplete";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { PatternFormat } from "react-number-format";
import { useCnpj } from "#hooks/brasilApi/useCnpj";
import { useAllCnaes } from "#hooks/quickApi/useCnaes";
import { FormFieldPaper } from "../../../components/multi-step-form";
import { useBusinessScope } from "../../../layout/business-context";
import type { NewBusinessFormValues } from "./types";

function formatCnae(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 7
    ? `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5)}`
    : value;
}

export function RegistrationStep() {
  const { data: cnaeOptions = [], isLoading: areCnaesLoading } = useAllCnaes();
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
  const { data: cnpjData, error: cnpjError } = useCnpj(document, isCnpj);
  const canCreateReseller = business?.type === "RESELLER";

  useEffect(() => {
    if (!cnpjData && !cnpjError) return;
    reset({
      ...getValues(),
      name: cnpjData?.razao_social ?? "",
      nomeFantasia: cnpjData?.nome_fantasia ?? "",
      cnaeId: undefined,
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
      setValue("cnaeId", undefined);
      clearErrors(["document", "name", "nomeFantasia", "cnaeId"]);
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
        <FormFieldPaper title="Razão social">
          <TextField
            variant="standard"
            label="Razão Social"
            value={name}
            fullWidth
            slotProps={{ input: { readOnly: true } }}
          />
        </FormFieldPaper>
      )}

      {isCnpj && (
        <FormFieldPaper title="Nome fantasia">
          <TextField
            variant="standard"
            label="Nome Fantasia"
            value={nomeFantasia}
            fullWidth
            slotProps={{ input: { readOnly: true } }}
          />
        </FormFieldPaper>
      )}

      {isCpf && (
        <FormFieldPaper
          title="Categoria"
          description="Selecione o MCC e CNAE do estabelecimento."
          error={Boolean(errors.cnaeId)}
          required
        >
          <Controller
            name="cnaeId"
            control={control}
            render={({ field: { onChange, value, ref } }) => (
              <Autocomplete
                options={cnaeOptions}
                loading={areCnaesLoading}
                getOptionLabel={(option) =>
                  `${option.mcc} - ${formatCnae(option.code)} - ${option.description}`
                }
                isOptionEqualToValue={(option, selected) =>
                  option.id === selected.id
                }
                value={
                  cnaeOptions.find((option) => option.id === value) ?? null
                }
                getOptionKey={(option) => option.id}
                onChange={(_, selected) => onChange(selected?.id)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    inputRef={ref}
                    variant="standard"
                    label="Categoria"
                    placeholder="MCC, CNAE"
                    fullWidth
                    required
                    error={Boolean(errors.cnaeId)}
                    helperText={errors.cnaeId?.message}
                  />
                )}
              />
            )}
          />
        </FormFieldPaper>
      )}
    </>
  );
}
