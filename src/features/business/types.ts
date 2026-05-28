import type { z } from "zod";
import type { newBusinessSchema } from "./schemas";

export type NewBusinessFormValues = z.infer<typeof newBusinessSchema>;
