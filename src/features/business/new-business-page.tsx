import { zodResolver } from "@hookform/resolvers/zod";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { FormProvider, useForm } from "react-hook-form";
import { useCreateBusiness } from "#hooks/quickApi/useCreateBusiness";
import { FormPage } from "../../layout/form-page";
import { step1Schema } from "./schemas";
import { Step1 } from "./Step1";
import type { NewBusinessFormValues } from "./types";

export function NewBusiness() {
  const navigate = useNavigate();
  const { mutate: createBusiness, isPending } = useCreateBusiness();

  const methods = useForm<NewBusinessFormValues>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      documentType: "CPF",
      document: "",
      razaoSocial: "",
      nomeFantasia: "",
      mcc: "",
      email: "",
      celular: "",
    },
  });

  function onSubmit(data: NewBusinessFormValues) {
    createBusiness(data, {
      onSuccess: () => {
        void navigate({ to: "/home" });
      },
      onError: (err) => {
        methods.setError("root", { message: err.message });
      },
    });
  }

  return (
    <FormProvider {...methods}>
      <FormPage
        breadcrumbs={[{ to: "/home", label: "Início" }]}
        currentLabel="Cadastro de EC"
        title="Novo Estabelecimento Comercial"
        subtitle="Preencha os dados iniciais para criar o cadastro do EC. Após salvar, você poderá completar o credenciamento."
      >
        <Box
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          component="form"
          noValidate
        >
          <Step1 />
          {methods.formState.errors.root && (
            <Typography color="error">
              {methods.formState.errors.root.message}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Button
            variant="outlined"
            color="error"
            onClick={() => void navigate({ to: "/home" })}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            loading={isPending}
            onClick={methods.handleSubmit(onSubmit)}
          >
            Salvar
          </Button>
        </Box>
      </FormPage>
    </FormProvider>
  );
}
