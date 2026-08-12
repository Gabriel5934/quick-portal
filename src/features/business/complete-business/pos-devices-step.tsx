import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { usePosModels } from "#hooks/quickApi/usePosModels";
import { FormFieldPaper } from "../../../components/multi-step-form";
import type { CompleteBusinessFormValues } from "./types";

export function PosDevicesStep() {
  const { data: models = [] } = usePosModels();
  const {
    control,
    formState: { errors },
  } = useFormContext<CompleteBusinessFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "posDevices",
  });

  return (
    <>
      {fields.map((item, index) => {
        const deviceError = errors.posDevices?.[index];
        return (
          <FormFieldPaper
            key={item.id}
            title={`Terminal ${index + 1}`}
            description="Preencha modelo e serial juntos, ou deixe ambos vazios."
            error={!!deviceError}
          >
            <Stack spacing={2}>
              <Controller
                name={`posDevices.${index}.model`}
                control={control}
                render={({ field: { onChange, value, ref } }) => (
                  <Autocomplete
                    options={models}
                    getOptionLabel={(option) => option.model}
                    getOptionKey={(option) => option.id}
                    isOptionEqualToValue={(option, selected) =>
                      option.id === selected.id
                    }
                    value={
                      models.find((model) => String(model.id) === value) ?? null
                    }
                    onChange={(_, selected) =>
                      onChange(selected ? String(selected.id) : "")
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        inputRef={ref}
                        variant="standard"
                        label="Modelo"
                        fullWidth
                        error={!!deviceError?.model}
                        helperText={deviceError?.model?.message}
                      />
                    )}
                  />
                )}
              />
              <Controller
                name={`posDevices.${index}.serialNumber`}
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    variant="standard"
                    label="Serial"
                    fullWidth
                    error={!!deviceError?.serialNumber}
                    helperText={deviceError?.serialNumber?.message}
                  />
                )}
              />
              <IconButton
                aria-label={`Remover terminal ${index + 1}`}
                onClick={() => remove(index)}
                disabled={fields.length === 1}
                color="error"
                sx={{ alignSelf: "flex-end" }}
              >
                <DeleteIcon />
              </IconButton>
            </Stack>
          </FormFieldPaper>
        );
      })}
      <Button
        type="button"
        startIcon={<AddIcon />}
        onClick={() => append({ model: "", serialNumber: "" })}
        disabled={fields.length >= 5}
        variant="outlined"
        sx={{ alignSelf: "flex-start" }}
      >
        Adicionar terminal
      </Button>
    </>
  );
}
