import type { z } from "zod";
import type { newBusinessSchema } from "./schema";

export type NewBusinessFormValues = z.infer<typeof newBusinessSchema>;
