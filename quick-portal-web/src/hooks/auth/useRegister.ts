import { useMutation } from "@tanstack/react-query";
import { firstError } from "#hooks/errors";

type RegisterRequest = {
  email: string;
  password: string;
};

type RegisterResponse = {
  id: number;
  email: string;
};

async function fetchRegister(
  payload: RegisterRequest,
): Promise<RegisterResponse> {
  const res = await fetch(
    `${import.meta.env.VITE_API_BASE_URL}/users/register/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  const data = (await res.json().catch(() => null)) as
    | (Partial<RegisterResponse> & { refresh?: string; detail?: string })
    | null;

  if (!res.ok) {
    throw new Error(firstError(data) ?? "Erro ao criar conta.");
  }

  const id = data?.id;
  const email = data?.email;

  if (!id || !email) {
    throw new Error("Invalid token response from server.");
  }

  return { id, email };
}

export function useRegister() {
  return useMutation({
    mutationFn: fetchRegister,
  });
}
