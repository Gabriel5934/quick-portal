import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useStateMachine } from "little-state-machine";
import {
  FormFieldPaper,
  WizardActions,
} from "../../../components/multi-step-form";
import { scheduleSchema, type ScheduleValues } from "../schemas";
import {
  resetRecurringFeeDraft,
  updateRecurringFeeDraft,
  type ChargeRule,
  type RecurrenceUnit,
} from "../form-store";
import { StepForm } from "../step-layout";

const units = [
  ["DAY", "Dia(s)"],
  ["WEEK", "Semana(s)"],
  ["MONTH", "Mês(es)"],
  ["YEAR", "Ano(s)"],
] as const;
const weekdays = [
  [1, "Segunda-feira"],
  [2, "Terça-feira"],
  [3, "Quarta-feira"],
  [4, "Quinta-feira"],
  [5, "Sexta-feira"],
  [6, "Sábado"],
  [7, "Domingo"],
] as const;
const months = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function defaultRule(unit: RecurrenceUnit): ChargeRule {
  return {
    DAY: "INTERVAL",
    WEEK: "WEEKDAY",
    MONTH: "DAY_OF_MONTH",
    YEAR: "DATE_OF_YEAR",
  }[unit] as ChargeRule;
}

export function ScheduleStep() {
  const navigate = useNavigate();
  const { state, actions } = useStateMachine({
    updateRecurringFeeDraft,
    resetRecurringFeeDraft,
  });
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<ScheduleValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: state.recurringFeeDraft,
  });
  const unit = useWatch({ control, name: "recurrenceUnit" });
  const rule = useWatch({ control, name: "chargeRule" });
  const cancel = () => {
    actions.resetRecurringFeeDraft();
    void navigate({ to: "/recurring-fees" });
  };

  return (
    <StepForm
      onSubmit={(event) =>
        void handleSubmit((values) => {
          actions.updateRecurringFeeDraft({
            ...values,
            chargeWeekday:
              values.chargeRule === "WEEKDAY"
                ? values.chargeWeekday
                : undefined,
            chargeDay: ["DAY_OF_MONTH", "DATE_OF_YEAR"].includes(
              values.chargeRule,
            )
              ? values.chargeDay
              : undefined,
            chargeMonth:
              values.recurrenceUnit === "YEAR" ? values.chargeMonth : undefined,
            businessDayOrdinal:
              values.chargeRule === "BUSINESS_DAY_OF_MONTH"
                ? values.businessDayOrdinal
                : undefined,
          });
          void navigate({ to: "/recurring-fees/new/targets" });
        })(event)
      }
    >
      <FormFieldPaper
        title="Frequência"
        description="Defina quanto tempo existe entre as cobranças."
        error={!!(errors.recurrenceInterval || errors.recurrenceUnit)}
        required
      >
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Controller
            name="recurrenceInterval"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                variant="standard"
                type="number"
                label="A cada"
                slotProps={{ htmlInput: { min: 1 } }}
                onChange={(event) => field.onChange(Number(event.target.value))}
                error={!!errors.recurrenceInterval}
                helperText={errors.recurrenceInterval?.message}
              />
            )}
          />
          <Controller
            name="recurrenceUnit"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                variant="standard"
                select
                label="Período"
                sx={{ minWidth: 180 }}
                onChange={(event) => {
                  const nextUnit = event.target.value as RecurrenceUnit;
                  field.onChange(nextUnit);
                  setValue("chargeRule", defaultRule(nextUnit));
                  setValue(
                    "chargeWeekday",
                    nextUnit === "WEEK" ? 1 : undefined,
                  );
                  setValue(
                    "chargeDay",
                    ["MONTH", "YEAR"].includes(nextUnit) ? 1 : undefined,
                  );
                  setValue("chargeMonth", nextUnit === "YEAR" ? 1 : undefined);
                  setValue("businessDayOrdinal", undefined);
                }}
              >
                {units.map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Stack>
      </FormFieldPaper>
      <FormFieldPaper
        title="Dia da cobrança"
        description="As opções mudam conforme a recorrência selecionada."
        error={
          !!(
            errors.chargeRule ||
            errors.chargeWeekday ||
            errors.chargeDay ||
            errors.chargeMonth ||
            errors.businessDayOrdinal
          )
        }
        required
      >
        <Stack spacing={2}>
          {unit === "DAY" && (
            <TextField
              variant="standard"
              value="A partir da data inicial"
              label="Regra"
              disabled
            />
          )}
          {unit === "WEEK" && (
            <Controller
              name="chargeWeekday"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  variant="standard"
                  select
                  label="Dia da semana"
                  onChange={(event) =>
                    field.onChange(Number(event.target.value))
                  }
                  error={!!errors.chargeWeekday}
                  helperText={errors.chargeWeekday?.message}
                >
                  {weekdays.map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          )}
          {["MONTH", "YEAR"].includes(unit) && (
            <Controller
              name="chargeRule"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  variant="standard"
                  select
                  label="Tipo de dia"
                >
                  <MenuItem
                    value={unit === "YEAR" ? "DATE_OF_YEAR" : "DAY_OF_MONTH"}
                  >
                    Dia do mês
                  </MenuItem>
                  <MenuItem value="BUSINESS_DAY_OF_MONTH">
                    Dia útil do mês
                  </MenuItem>
                </TextField>
              )}
            />
          )}
          {unit === "YEAR" && (
            <Controller
              name="chargeMonth"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  variant="standard"
                  select
                  label="Mês"
                  onChange={(event) =>
                    field.onChange(Number(event.target.value))
                  }
                  error={!!errors.chargeMonth}
                  helperText={errors.chargeMonth?.message}
                >
                  {months.map((label, index) => (
                    <MenuItem key={label} value={index + 1}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          )}
          {["DAY_OF_MONTH", "DATE_OF_YEAR"].includes(rule) && (
            <Controller
              name="chargeDay"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  variant="standard"
                  value={field.value ?? ""}
                  type="number"
                  label="Dia"
                  slotProps={{ htmlInput: { min: 1, max: 31 } }}
                  onChange={(event) =>
                    field.onChange(Number(event.target.value))
                  }
                  error={!!errors.chargeDay}
                  helperText={
                    errors.chargeDay?.message ??
                    "Dias inexistentes usam o último dia do mês."
                  }
                />
              )}
            />
          )}
          {rule === "BUSINESS_DAY_OF_MONTH" && (
            <Controller
              name="businessDayOrdinal"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  variant="standard"
                  value={field.value ?? ""}
                  type="number"
                  label="Número do dia útil"
                  slotProps={{ htmlInput: { min: 1, max: 31 } }}
                  onChange={(event) =>
                    field.onChange(Number(event.target.value))
                  }
                  error={!!errors.businessDayOrdinal}
                  helperText={
                    errors.businessDayOrdinal?.message ??
                    "Ex.: 5 para o quinto dia útil."
                  }
                />
              )}
            />
          )}
        </Stack>
      </FormFieldPaper>
      <FormFieldPaper
        title="Período de vigência"
        error={!!(errors.startDate || errors.endDate)}
        required
      >
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            variant="standard"
            type="date"
            label="Data inicial"
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
            {...register("startDate")}
            error={!!errors.startDate}
            helperText={errors.startDate?.message}
          />
          <TextField
            variant="standard"
            type="date"
            label="Data final (opcional)"
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
            {...register("endDate")}
            error={!!errors.endDate}
            helperText={errors.endDate?.message}
          />
        </Stack>
      </FormFieldPaper>
      <WizardActions
        onCancel={cancel}
        onBack={() => void navigate({ to: "/recurring-fees/new/pricing" })}
      />
    </StepForm>
  );
}
