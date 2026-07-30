import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={fieldSx}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1">{value || "—"}</Typography>
    </Box>
  );
}

export function Step1() {
  const { data: mccOptions = [] } = useCnaeMcc();
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
  const codCnae = watch("codCnae") ?? "";
  const isCnpj = documentType === "CNPJ";
  const isCpf = documentType === "CPF";
  const mccLabel =
    mccOptions
      .filter((o) => String(o.cod_mcc) === codCnae)
      .map((o) => `${o.cod_mcc} — ${o.desc_cnae}`)[0] ?? "";

  const { data: cnpjData, error: cnpjError } = useCnpj(document, isCnpj);

  useEffect(() => {
    if (!cnpjData && !cnpjError) return;
    const mmcMatch = cnpjData
      ? mccOptions.find(
          (o) => o.cod_cnae.replace(/\D/g, "") === String(cnpjData.cnae_fiscal),
        )
      : null;
    reset({
      ...getValues(),
      name: cnpjData?.razao_social ?? "",
      nomeFantasia: cnpjData?.nome_fantasia ?? "",
      codCnae: mmcMatch ? String(mmcMatch.cod_mcc) : "",
    });
  }, [cnpjData, cnpjError, mccOptions, reset, getValues]);

  const handleDocumentTypeChange = (
    fieldOnChange: (...event: unknown[]) => void,
  ) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      fieldOnChange(e);
      setValue("document", "");
      setValue("name", "");
      setValue("nomeFantasia", "");
      setValue("codCnae", "");
      clearErrors(["document", "name", "nomeFantasia", "codCnae"]);
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

        {isCpf && (
          <TextField
            {...register("name")}
            label="Nome Completo"
            required
            error={Boolean(errors.name)}
            helperText={errors.name?.message}
            sx={fieldSx}
          />
        )}

        {isCnpj && (
          <>
            <ReadOnlyField label="Razão Social" value={name} />
            <ReadOnlyField label="Nome Fantasia" value={nomeFantasia} />
            <ReadOnlyField label="MCC" value={mccLabel} />
          </>
        )}

        {isCpf && (
          <Controller
            name="codCnae"
            control={control}
            render={({ field: { onChange, value, ref } }) => (
              <Autocomplete
                options={mccOptions}
                getOptionLabel={(option) =>
                  `${option.cod_mcc} — ${option.desc_cnae}`
                }
                isOptionEqualToValue={(option, val) =>
                  option.cod_mcc === val.id
                }
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
                    error={Boolean(errors.codCnae)}
                    helperText={errors.codCnae?.message}
                  />
                )}
              />
            )}
          />
        )}
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
