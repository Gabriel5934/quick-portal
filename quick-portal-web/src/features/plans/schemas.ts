import { z } from "zod";

export const newPlanSchema = z.object({
  title: z.string().trim().min(1, "Nome é obrigatório"),
  description: z.string(),
  activity: z.number({ message: "Atividade é obrigatória" }).int().positive(),
  basketId: z.union([z.literal(117), z.literal(333)], { message: "Cesta é obrigatória" }),
  anticipation_type: z.enum(["None", "Rotating"]),
  markups: z.record(z.string(), z.string()),
  defaults: z.record(z.string(), z.string()),
});

export type NewPlanFormValues = z.infer<typeof newPlanSchema>;
