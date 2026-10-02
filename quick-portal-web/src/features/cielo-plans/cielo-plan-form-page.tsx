import { zodResolver } from "@hookform/resolvers/zod";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Controller,
  FormProvider,
  useForm,
  type FieldErrors,
  type FieldPath,
} from "react-hook-form";
import {
  CieloPlanRequestError,
  useCieloPlan,
  useCreateCieloPlan,
} from "#hooks/quickApi/useCieloPlans";
import { FormFieldPaper } from "../../components/multi-step-form";
import { useBusinessScope } from "../../layout/business-context";
import { FormPage } from "../../layout/form-page";
import { RateAccordion, type RateAccordionState } from "./rate-accordion";
import {
  CIELO_CARD_BRANDS,
  cieloPlanRequest,
  copyPlanValues,
  emptyRates,
  rateAt,
} from "./rates";
import { cieloPlanFormSchema } from "./schemas";
import type { CieloCardBrand, CieloPlan, CieloPlanFormValues } from "./types";

function containsError(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if ("message" in value) return true;
  return Object.values(value).some(containsError);
}

function firstMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(firstMessage).find(Boolean);
  return undefined;
}

export function NewCieloPlanPage({ copyFromId }: { copyFromId?: number }) {
  const { business } = useBusinessScope();
  const source = useCieloPlan(copyFromId, business?.id);

  if (copyFromId !== undefined) {
    if (source.error) {
      return <Alert severity="error">{source.error.message}</Alert>;
    }
    if (source.data === undefined) {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress aria-label="Carregando plano a copiar" />
        </Box>
      );
    }
    if (source.data === null) {
      return (
        <Alert severity="warning">
          Plano a copiar não encontrado para a empresa selecionada.
        </Alert>
      );
    }
  }

  return (
    <CieloPlanForm
      key={source.data?.id ?? "new"}
      businessId={business?.id}
      source={source.data ?? undefined}
    />
  );
}

function CieloPlanForm({
  businessId,
  source,
}: {
  businessId: number | undefined;
  source?: CieloPlan;
}) {
  const navigate = useNavigate();
  const createPlan = useCreateCieloPlan(businessId);
  const methods = useForm<CieloPlanFormValues>({
    resolver: zodResolver(cieloPlanFormSchema),
    defaultValues: source
      ? copyPlanValues(source)
      : { name: "", description: "", rates: emptyRates() },
  });
  const {
    control,
    formState: { errors },
  } = methods;
  const [expanded, setExpanded] = useState<CieloCardBrand | false>(false);
  const [validated, setValidated] = useState<ReadonlySet<CieloCardBrand>>(
    () => new Set(),
  );

  function accordionState(brand: CieloCardBrand): RateAccordionState {
    if (!validated.has(brand)) return "incomplete";
    return containsError(errors.rates?.[brand]) ? "error" : "complete";
  }

  /** Shows every brand as validated and expands the first one with errors. */
  function showValidatedRates(invalidBrands: CieloCardBrand[]) {
    setValidated(new Set(CIELO_CARD_BRANDS));
    const firstInvalid = CIELO_CARD_BRANDS.find((brand) =>
      invalidBrands.includes(brand),
    );
    if (firstInvalid) setExpanded(firstInvalid);
  }

  function showFormErrors(formErrors: FieldErrors<CieloPlanFormValues>) {
    showValidatedRates(
      CIELO_CARD_BRANDS.filter((brand) =>
        containsError(formErrors.rates?.[brand]),
      ),
    );
  }

  async function conclude(brand: CieloCardBrand) {
    await methods.trigger(`rates.${brand}`);
    setValidated((current) => new Set(current).add(brand));
    setExpanded(false);
  }

  function showRequestErrors(error: unknown) {
    const body = error instanceof CieloPlanRequestError ? error.body : null;
    const invalidBrands: CieloCardBrand[] = [];
    const unmapped: string[] = [];
    let mapped = false;

    function setFieldError(name: FieldPath<CieloPlanFormValues>, message: string) {
      methods.setError(name, { type: "server", message });
      mapped = true;
    }

    if (body && typeof body === "object" && !Array.isArray(body)) {
      for (const [field, value] of Object.entries(body)) {
        const message = firstMessage(value);
        if ((field === "name" || field === "description") && message) {
          setFieldError(field, message);
        } else if (field === "rates" && Array.isArray(value) && !message) {
          // Per-rate errors follow the order of the request rates.
          value.forEach((rateErrors: unknown, index) => {
            if (!rateErrors || typeof rateErrors !== "object") return;
            const { brand, row } = rateAt(index);
            for (const [key, messages] of Object.entries(rateErrors)) {
              const rateMessage = firstMessage(messages);
              if (!rateMessage) continue;
              if (key === "mdr" || key === "fixed_fee") {
                setFieldError(`rates.${brand}.${row}.${key}`, rateMessage);
                invalidBrands.push(brand);
              } else {
                unmapped.push(rateMessage);
              }
            }
          });
        } else if (message) {
          unmapped.push(message);
        }
      }
    }

    const detail =
      unmapped[0] ??
      (mapped
        ? "Corrija os campos destacados."
        : error instanceof Error
          ? error.message
          : undefined);
    methods.setError("root", {
      type: "server",
      message: `Não foi possível salvar o plano.${detail ? ` ${detail}` : ""}`,
    });
    showValidatedRates(invalidBrands);
  }

  async function submit(values: CieloPlanFormValues) {
    showValidatedRates([]);
    try {
      await createPlan.mutateAsync(cieloPlanRequest(values));
    } catch (error) {
      showRequestErrors(error);
      return;
    }
    await navigate({ to: "/planos-cielo" });
  }

  return (
    <FormProvider {...methods}>
      <FormPage
        breadcrumbs={[{ to: "/planos-cielo", label: "Planos Cielo" }]}
        currentLabel={source ? "Copiar plano" : "Novo plano"}
        title={source ? `Copiar ${source.name}` : "Novo plano Cielo"}
        subtitle={
          source
            ? "O novo plano começa com a descrição e as taxas do plano copiado e é independente dele."
            : "Defina o MDR e a taxa fixa de cada bandeira, forma de pagamento e parcela."
        }
      >
        <Box
          component="form"
          noValidate
          onSubmit={(event) =>
            void methods.handleSubmit(submit, showFormErrors)(event)
          }
          sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        >
          <FormFieldPaper
            title="Informações básicas"
            error={!!errors.name || !!errors.description}
            required
          >
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Nome"
                  required
                  error={!!errors.name}
                  helperText={
                    errors.name?.message ??
                    "Deve ser diferente dos nomes de todos os planos da empresa, inclusive os arquivados."
                  }
                />
              )}
            />
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Descrição"
                  multiline
                  minRows={2}
                  error={!!errors.description}
                  helperText={errors.description?.message}
                />
              )}
            />
          </FormFieldPaper>

          <FormFieldPaper
            title="Taxas"
            description="Preencha o MDR e a taxa fixa de cada bandeira. “Concluir” valida a bandeira e fecha a tabela."
            required
          >
            <Stack spacing={1}>
              {CIELO_CARD_BRANDS.map((brand) => (
                <RateAccordion
                  key={brand}
                  brand={brand}
                  expanded={expanded === brand}
                  state={accordionState(brand)}
                  onExpandedChange={(isExpanded) =>
                    setExpanded(isExpanded ? brand : false)
                  }
                  onConclude={() => void conclude(brand)}
                />
              ))}
            </Stack>
          </FormFieldPaper>

          {errors.root ? (
            <Alert severity="error">{errors.root.message}</Alert>
          ) : null}

          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Button
              variant="outlined"
              color="error"
              onClick={() => void navigate({ to: "/planos-cielo" })}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="contained"
              loading={createPlan.isPending}
              disabled={!businessId}
            >
              Salvar
            </Button>
          </Box>
        </Box>
      </FormPage>
    </FormProvider>
  );
}
