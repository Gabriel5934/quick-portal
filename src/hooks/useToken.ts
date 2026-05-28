import { useMutation } from "@tanstack/react-query";
import type { ValidationErrors } from "./types";

type TokenRequest = {
  email: string;
  password: string;
};

type TokenResponse = {
  access: string;
  token: string;
};

async function fetchToken(payload: TokenRequest): Promise<TokenResponse> {
  const res = await fetch("http://localhost:8000/api/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => null)) as
    | (Partial<TokenResponse> & { refresh?: string; detail?: string })
    | null;

  if (!res.ok) {
    const errors = data as ValidationErrors;
    const keys = Object.keys(errors);
    throw new Error(errors[keys[0]][0]);
  }

  const access = data?.access;
  const token = data?.token ?? data?.refresh;

  if (!access || !token) {
    throw new Error("Invalid token response from server.");
  }

  return { access, token };
}

export function useToken() {
  return useMutation({
    mutationFn: fetchToken,
  });
}
