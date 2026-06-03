import { zodResolver } from "@hookform/resolvers/zod";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { FormProvider, useForm } from "react-hook-form";
import { useCreateBusiness } from "#hooks/quickApi/useCreateBusiness";
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
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          height: "100%",
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Breadcrumbs aria-label="breadcrumb">
            <Link
              component={RouterLink}
              to="/home"
              underline="hover"
              color="inherit"
            >
              Início
            </Link>
            <Typography color="text.primary" aria-current="page">
              Cadastro de EC
            </Typography>
          </Breadcrumbs>

          <Typography variant="h5">Novo Estabelecimento Comercial</Typography>
          <Typography variant="subtitle1">
            Preencha os dados iniciais para criar o cadastro do EC. Após salvar,
            você poderá completar o credenciamento.
          </Typography>
        </Box>

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
      </Box>
    </FormProvider>
  );
}
