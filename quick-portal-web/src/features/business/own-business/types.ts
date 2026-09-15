import type { z } from "zod";
import type { ownBusinessSchema } from "./schemas";

export type OwnBusinessFormValues = z.infer<typeof ownBusinessSchema>;
