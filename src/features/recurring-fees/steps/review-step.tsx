import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useNavigate } from "@tanstack/react-router";
import { useStateMachine } from "little-state-machine";
import {
  FormFieldPaper,
  WizardActions,
} from "../../../components/multi-step-form";
import { useBusinessScope } from "../../../layout/business-context";
import {
  useCreateRecurringFee,
  useRecurringFeeChildren,
  type RecurringFeePayload,
} from "../../../hooks/quickApi/useRecurringFees";
import { resetRecurringFeeDraft } from "../form-store";
import { StepForm } from "../step-layout";

function money(value: string) {
  const parsed = Number(value.replace(",", "."));
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const recurrenceLabels = {
  DAY: ["dia", "dias"],
  WEEK: ["semana", "semanas"],
  MONTH: ["mês", "meses"],
  YEAR: ["ano", "anos"],
} as const;

function recurrenceSummary(
  interval: number,
  unit: keyof typeof recurrenceLabels,
) {
  const [singular, plural] = recurrenceLabels[unit];
  return `A cada ${interval} ${interval === 1 ? singular : plural}`;
}

export function ReviewStep() {
  const navigate = useNavigate();
  const { business } = useBusinessScope();
  const { state, actions } = useStateMachine({ resetRecurringFeeDraft });
  const draft = state.recurringFeeDraft;
  const { data: children = [] } = useRecurringFeeChildren(business?.id);
  const createFee = useCreateRecurringFee(business?.id);
  const selected = children.filter((item) => draft.targetIds.includes(item.id));

  const submit = () => {
    const payload: RecurringFeePayload = {
      name: draft.name,
      description: draft.description,
      setup_value: draft.setupValue.replace(",", "."),
      pricing_mode: draft.pricingMode,
      fee_value:
        draft.pricingMode === "FIXED" ? draft.feeValue.replace(",", ".") : null,
      goal_amount:
        draft.pricingMode === "GOAL"
          ? draft.goalAmount.replace(",", ".")
          : null,
      value_below_goal:
        draft.pricingMode === "GOAL"
          ? draft.valueBelowGoal.replace(",", ".")
          : null,
      value_at_or_above_goal:
        draft.pricingMode === "GOAL"
          ? draft.valueAtOrAboveGoal.replace(",", ".")
          : null,
      recurrence_unit: draft.recurrenceUnit,
      recurrence_interval: draft.recurrenceInterval,
      charge_rule: draft.chargeRule,
      charge_weekday: draft.chargeWeekday ?? null,
      charge_day: draft.chargeDay ?? null,
      charge_month: draft.chargeMonth ?? null,
      business_day_ordinal: draft.businessDayOrdinal ?? null,
      start_date: draft.startDate,
      end_date: draft.endDate || null,
      active: draft.active,
      targets: draft.targetIds,
    };
    createFee.mutate(payload, {
      onSuccess: () => {
        actions.resetRecurringFeeDraft();
        void navigate({ to: "/recurring-fees" });
      },
    });
  };
  const cancel = () => {
    actions.resetRecurringFeeDraft();
    void navigate({ to: "/recurring-fees" });
  };

  return (
    <StepForm
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {createFee.error && (
        <Alert severity="error">{createFee.error.message}</Alert>
      )}
      <FormFieldPaper title="Informações">
        <Stack spacing={1}>
          <Typography>
            <strong>{draft.name}</strong>
          </Typography>
          {draft.description && (
            <Typography color="text.secondary">{draft.description}</Typography>
          )}
          <Typography>Adesão: {money(draft.setupValue)}</Typography>
          <Chip
            label={draft.active ? "Ativa" : "Inativa"}
            color={draft.active ? "success" : "default"}
            size="small"
            sx={{ alignSelf: "flex-start" }}
          />
        </Stack>
      </FormFieldPaper>
      <FormFieldPaper title="Cobrança">
        {draft.pricingMode === "FIXED" ? (
          <Typography>Valor fixo: {money(draft.feeValue)}</Typography>
        ) : (
          <Stack divider={<Divider flexItem />} spacing={1}>
            <Typography>Meta: {money(draft.goalAmount)}</Typography>
            <Typography>
              Abaixo da meta: {money(draft.valueBelowGoal)}
            </Typography>
            <Typography>
              Meta atingida ou superada: {money(draft.valueAtOrAboveGoal)}
            </Typography>
          </Stack>
        )}
      </FormFieldPaper>
      <FormFieldPaper title="Recorrência">
        <Typography>
          {recurrenceSummary(draft.recurrenceInterval, draft.recurrenceUnit)}
        </Typography>
        <Typography>
          Vigência:{" "}
          {new Date(`${draft.startDate}T00:00:00`).toLocaleDateString("pt-BR")}
          {draft.endDate
            ? ` até ${new Date(`${draft.endDate}T00:00:00`).toLocaleDateString("pt-BR")}`
            : ", sem data final"}
        </Typography>
      </FormFieldPaper>
      <FormFieldPaper title={`Empresas (${selected.length})`}>
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
          {selected.map((item) => (
            <Chip key={item.id} label={item.trade_name || item.name} />
          ))}
        </Stack>
      </FormFieldPaper>
      <WizardActions
        submitLabel="Criar taxa recorrente"
        loading={createFee.isPending}
        onCancel={cancel}
        onBack={() => void navigate({ to: "/recurring-fees/new/targets" })}
      />
    </StepForm>
  );
}
