import type { z } from "zod";
import type { completeBusinessSchema } from "./schemas";

export type CompleteBusinessFormValues = z.infer<typeof completeBusinessSchema>;
