import Autocomplete from "@mui/material/Autocomplete";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import BadgeIcon from "@mui/icons-material/Badge";
import MailIcon from "@mui/icons-material/Mail";
import { Controller, useFormContext } from "react-hook-form";
import { PatternFormat } from "react-number-format";
import { useEffect } from "react";
import { useCnaeMcc } from "#hooks/quickApi/useCnaeMcc";
import { useCnpj } from "#hooks/brasilApi/useCnpj";
import { FormPaper } from "./FormPaper";
import type { NewBusinessFormValues } from "./types";

const fieldSx = { flexGrow: 1, flexShrink: 1, flexBasis: "360px" };

export function Step1() {
  const { data: mccOptions = [] } = useCnaeMcc();
  const {
    register,
    control,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useFormContext<NewBusinessFormValues>();

  const documentType = watch("documentType");
  const document = watch("document") ?? "";
  const isCnpj = documentType === "CNPJ";

  const { data: cnpjData, error: cnpjError } = useCnpj(document, isCnpj);

  useEffect(() => {
    if (!cnpjData) return;
    setValue("razaoSocial", cnpjData.razao_social, { shouldValidate: true });
    setValue("nomeFantasia", cnpjData.nome_fantasia, { shouldValidate: true });
    const match = mccOptions.find(
      (o) => o.cod_cnae.replace(/\D/g, "") === String(cnpjData.cnae_fiscal),
    );
    setValue("mcc", match ? String(match.cod_mcc) : "", {
      shouldValidate: true,
    });
    clearErrors("document");
  }, [cnpjData, mccOptions, setValue, clearErrors]);

  useEffect(() => {
    if (cnpjError) {
      setError("document", { type: "manual", message: cnpjError.message });
    }
  }, [cnpjError, setError]);

  const handleDocumentTypeChange = (
    fieldOnChange: (...event: unknown[]) => void,
  ) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      fieldOnChange(e);
      setValue("document", "");
      setValue("razaoSocial", "");
      setValue("nomeFantasia", "");
      setValue("mcc", "");
      clearErrors(["document", "razaoSocial", "nomeFantasia", "mcc"]);
    };
  };

  return (
    <>
      <FormPaper
        title="Dados Básicos"
        subtitle="Informações básicas do estabelecimento comercial"
        Icon={BadgeIcon}
      >
        <FormControl sx={{ flexBasis: "100%" }}>
          <FormLabel>CNPJ/CPF</FormLabel>
          <Controller
            name="documentType"
            control={control}
            render={({ field: { onChange, ...field } }) => (
              <RadioGroup
                {...field}
                row
                onChange={handleDocumentTypeChange(onChange)}
              >
                <FormControlLabel
                  value="CNPJ"
                  control={<Radio />}
                  label="CNPJ"
                />
                <FormControlLabel value="CPF" control={<Radio />} label="CPF" />
              </RadioGroup>
            )}
          />
        </FormControl>

        <Controller
          name="document"
          control={control}
          render={({ field: { ref, onChange, value, ...restField } }) => (
            <PatternFormat
              {...restField}
              value={value}
              format={
                documentType === "CPF" ? "###.###.###-##" : "##.###.###/####-##"
              }
              onValueChange={(values) => onChange(values.formattedValue)}
              customInput={TextField}
              getInputRef={ref}
              label="Documento"
              required
              error={Boolean(errors.document)}
              helperText={errors.document?.message}
              sx={fieldSx}
            />
          )}
        />

        <TextField
          {...register("razaoSocial")}
          label="Nome / Razão Social"
          required
          disabled={isCnpj}
          slotProps={{ inputLabel: { shrink: isCnpj || undefined } }}
          error={Boolean(errors.razaoSocial)}
          helperText={errors.razaoSocial?.message}
          sx={fieldSx}
        />

        <TextField
          {...register("nomeFantasia")}
          label="Nome Fantasia"
          disabled={isCnpj}
          slotProps={{ inputLabel: { shrink: isCnpj || undefined } }}
          error={Boolean(errors.nomeFantasia)}
          helperText={errors.nomeFantasia?.message}
          sx={fieldSx}
        />

        <Controller
          name="mcc"
          control={control}
          render={({ field: { onChange, value, ref } }) => (
            <Autocomplete
              options={mccOptions}
              disabled={isCnpj}
              getOptionLabel={(option) =>
                `${option.cod_mcc} — ${option.desc_cnae}`
              }
              isOptionEqualToValue={(option, val) => option.cod_mcc === val.id}
              value={
                mccOptions.find((o) => String(o.cod_mcc) === value) ?? null
              }
              getOptionKey={(option) => option.id}
              onChange={(_, selected) =>
                onChange(selected ? String(selected.cod_mcc) : "")
              }
              sx={fieldSx}
              renderInput={(params) => (
                <TextField
                  {...params}
                  inputRef={ref}
                  label="MCC"
                  required
                  error={Boolean(errors.mcc)}
                  helperText={errors.mcc?.message}
                />
              )}
            />
          )}
        />
      </FormPaper>

      <FormPaper
        title="Dados de Contato"
        subtitle="Informações para comunicação com o estabelecimento"
        Icon={MailIcon}
      >
        <TextField
          {...register("email")}
          type="email"
          label="Email"
          required
          error={Boolean(errors.email)}
          helperText={errors.email?.message}
          sx={fieldSx}
        />

        <Controller
          name="celular"
          control={control}
          render={({ field: { ref, onChange, value, ...restField } }) => (
            <PatternFormat
              {...restField}
              value={value}
              format="(##) #####-####"
              onValueChange={(values) => onChange(values.formattedValue)}
              customInput={TextField}
              getInputRef={ref}
              label="Celular"
              required
              error={Boolean(errors.celular)}
              helperText={errors.celular?.message}
              sx={fieldSx}
            />
          )}
        />

        <Controller
          name="telefone"
          control={control}
          render={({ field: { ref, onChange, value, ...restField } }) => (
            <PatternFormat
              {...restField}
              value={value}
              format="(##) ####-####"
              onValueChange={(values) => onChange(values.formattedValue)}
              customInput={TextField}
              getInputRef={ref}
              label="Telefone"
              required
              error={Boolean(errors.telefone)}
              helperText={errors.telefone?.message}
              sx={fieldSx}
            />
          )}
        />
      </FormPaper>
    </>
  );
}
