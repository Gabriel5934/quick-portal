import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useAllCnaes } from "#hooks/quickApi/useCnaes";
import { FormFieldPaper } from "../../../components/multi-step-form";
import type { NewBusinessFormValues } from "./types";

interface BusinessReviewStepProps {
  values: NewBusinessFormValues;
}

function ReviewItem({ label, value }: { label: string; value?: string }) {
  return (
    <Typography>
      <strong>{label}:</strong> {value || "—"}
    </Typography>
  );
}

export function BusinessReviewStep({ values }: BusinessReviewStepProps) {
  const { data: cnaes = [] } = useAllCnaes();
  const cnae = cnaes.find((option) => option.id === values.cnaeId);

  return (
    <>
      <FormFieldPaper title="Informações">
        <Stack spacing={1}>
          <Chip
            label={values.isReseller ? "Revenda" : "Estabelecimento"}
            color={values.isReseller ? "primary" : "default"}
            size="small"
            sx={{ alignSelf: "flex-start" }}
          />
          <ReviewItem label="Tipo de documento" value={values.documentType} />
          <ReviewItem label="Documento" value={values.document} />
        </Stack>
      </FormFieldPaper>

      <FormFieldPaper title="Dados cadastrais">
        <Stack divider={<Divider flexItem />} spacing={1}>
          <ReviewItem
            label={
              values.documentType === "CPF" ? "Nome completo" : "Razão social"
            }
            value={values.name}
          />
          {values.documentType === "CNPJ" && (
            <ReviewItem label="Nome fantasia" value={values.nomeFantasia} />
          )}
          {values.documentType === "CPF" && (
            <ReviewItem
              label="Categoria"
              value={
                cnae
                  ? `${cnae.mcc} - ${cnae.code} - ${cnae.description}`
                  : undefined
              }
            />
          )}
        </Stack>
      </FormFieldPaper>

      <FormFieldPaper title="Contato">
        <Stack divider={<Divider flexItem />} spacing={1}>
          <ReviewItem label="Email" value={values.email} />
          <ReviewItem label="Celular" value={values.celular} />
          <ReviewItem label="Telefone" value={values.telefone} />
        </Stack>
      </FormFieldPaper>
    </>
  );
}
