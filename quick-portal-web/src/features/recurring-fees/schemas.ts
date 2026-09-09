import { z } from "zod";

const money = z
  .string()
  .min(1, "Informe um valor")
  .refine((value) => {
    const number = Number(value.replace(",", "."));
    return Number.isFinite(number) && number >= 0;
  }, "Informe um valor maior ou igual a zero");

export const detailsSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(200),
  description: z.string().max(2000),
  setupValue: money,
  active: z.boolean(),
});

export const pricingSchema = z
  .object({
    pricingMode: z.enum(["FIXED", "GOAL"]),
    feeValue: z.string(),
    goalAmount: z.string(),
    valueBelowGoal: z.string(),
    valueAtOrAboveGoal: z.string(),
  })
  .superRefine((value, ctx) => {
    const fields =
      value.pricingMode === "FIXED"
        ? (["feeValue"] as const)
        : (["goalAmount", "valueBelowGoal", "valueAtOrAboveGoal"] as const);
    for (const field of fields) {
      const result = money.safeParse(value[field]);
      if (!result.success) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: result.error.issues[0]?.message ?? "Valor inválido",
        });
      }
    }
  });

export const scheduleSchema = z
  .object({
    recurrenceUnit: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]),
    recurrenceInterval: z.number().int().min(1, "Use um intervalo positivo"),
    chargeRule: z.enum([
      "INTERVAL",
      "WEEKDAY",
      "DAY_OF_MONTH",
      "BUSINESS_DAY_OF_MONTH",
      "DATE_OF_YEAR",
    ]),
    chargeWeekday: z.number().int().min(1).max(7).optional(),
    chargeDay: z.number().int().min(1).max(31).optional(),
    chargeMonth: z.number().int().min(1).max(12).optional(),
    businessDayOrdinal: z.number().int().min(1).max(31).optional(),
    startDate: z.string().min(1, "Data inicial é obrigatória"),
    endDate: z.string(),
  })
  .superRefine((value, ctx) => {
    const ruleByUnit = {
      DAY: ["INTERVAL"],
      WEEK: ["WEEKDAY"],
      MONTH: ["DAY_OF_MONTH", "BUSINESS_DAY_OF_MONTH"],
      YEAR: ["DATE_OF_YEAR", "BUSINESS_DAY_OF_MONTH"],
    } as const;
    if (
      !(ruleByUnit[value.recurrenceUnit] as readonly string[]).includes(
        value.chargeRule,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["chargeRule"],
        message: "Regra inválida",
      });
    }
    if (value.chargeRule === "WEEKDAY" && !value.chargeWeekday) {
      ctx.addIssue({
        code: "custom",
        path: ["chargeWeekday"],
        message: "Escolha o dia",
      });
    }
    if (
      ["DAY_OF_MONTH", "DATE_OF_YEAR"].includes(value.chargeRule) &&
      !value.chargeDay
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["chargeDay"],
        message: "Escolha o dia",
      });
    }
    if (value.recurrenceUnit === "YEAR" && !value.chargeMonth) {
      ctx.addIssue({
        code: "custom",
        path: ["chargeMonth"],
        message: "Escolha o mês",
      });
    }
    if (
      value.chargeRule === "BUSINESS_DAY_OF_MONTH" &&
      !value.businessDayOrdinal
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["businessDayOrdinal"],
        message: "Informe o dia útil",
      });
    }
    if (value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "A data final deve ser posterior à inicial",
      });
    }
  });

export const targetsSchema = z.object({
  targetIds: z.array(z.number()).min(1, "Selecione ao menos uma empresa"),
});

export type DetailsValues = z.infer<typeof detailsSchema>;
export type PricingValues = z.infer<typeof pricingSchema>;
export type ScheduleValues = z.infer<typeof scheduleSchema>;
export type TargetsValues = z.infer<typeof targetsSchema>;
