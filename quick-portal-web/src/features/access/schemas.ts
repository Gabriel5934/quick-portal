import { z } from "zod";

export const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Informe o e-mail.")
    .pipe(z.email("Informe um e-mail válido.")),
  role: z.enum(["ADMIN", "MANAGER", "VIEWER"]),
});

export type InviteFormValues = z.infer<typeof inviteSchema>;
