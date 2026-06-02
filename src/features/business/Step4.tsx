import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { usePosModels } from "../../hooks/usePosModels";
import { FormPaper } from "./FormPaper";
import type { CompleteBusinessFormValues } from "./types";

export function Step4() {
  const { data: posModels = [] } = usePosModels();
  const {
    control,
    formState: { errors },
  } = useFormContext<CompleteBusinessFormValues>();

  const { fields, append, remove } = useFieldArray({
    control,
    name: "posDevices",
  });

  return (
    <FormPaper
      title="Meios de Captura"
      subtitle="Informe os terminais POS do estabelecimento"
      Icon={PointOfSaleIcon}
    >
      {fields.map((field, index) => (
        <Box
          key={field.id}
          sx={{
            display: "flex",
            gap: 1,
            width: "100%",
            alignItems: "flex-start",
          }}
        >
          <Controller
            name={`posDevices.${index}.model`}
            control={control}
            render={({ field: { onChange, value, ref } }) => (
              <Autocomplete
                options={posModels}
                getOptionLabel={(option) => option.model}
                getOptionKey={(option) => option.id}
                isOptionEqualToValue={(option, val) => option.id === val.id}
                value={posModels.find((o) => String(o.id) === value) ?? null}
                onChange={(_, selected) =>
                  onChange(selected ? String(selected.id) : "")
                }
                sx={{ flexGrow: 1, flexShrink: 1, flexBasis: "360px" }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    inputRef={ref}
                    label="Modelo"
                    required
                    error={Boolean(errors.posDevices?.[index]?.model)}
                    helperText={errors.posDevices?.[index]?.model?.message}
                  />
                )}
              />
            )}
          />

          <Controller
            name={`posDevices.${index}.serialNumber`}
            control={control}
            render={({ field: fieldProps }) => (
              <TextField
                {...fieldProps}
                label="Serial"
                required
                error={Boolean(errors.posDevices?.[index]?.serialNumber)}
                helperText={errors.posDevices?.[index]?.serialNumber?.message}
                sx={{ flexGrow: 1, flexShrink: 1, flexBasis: "360px" }}
              />
            )}
          />

          <IconButton
            onClick={() => remove(index)}
            disabled={fields.length === 1}
            color="error"
            sx={{ mt: 1 }}
          >
            <DeleteIcon />
          </IconButton>
        </Box>
      ))}

      <Button
        startIcon={<AddIcon />}
        onClick={() => append({ model: "", serialNumber: "" })}
        disabled={fields.length >= 5}
        variant="outlined"
      >
        Adicionar
      </Button>
    </FormPaper>
  );
}
