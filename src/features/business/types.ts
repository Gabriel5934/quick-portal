import type { z } from "zod";
import type { step1Schema, completeBusinessSchema } from "./schemas";

export type NewBusinessFormValues = z.infer<typeof step1Schema>;
export type CompleteBusinessFormValues = z.infer<typeof completeBusinessSchema>;
