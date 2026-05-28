import { useMutation, useQuery } from "@tanstack/react-query";
import { getRefreshToken, setTokens, setRefreshToken } from "./auth/storage";
import type { ValidationErrors } from "./types";

type LoginRequest = {
  email: string;
  password: string;
};

type LoginResponse = {
  access: string;
  token: string;
};

async function fetchLogin(payload: LoginRequest): Promise<LoginResponse> {
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => null)) as
    | (Partial<LoginResponse> & { refresh?: string; detail?: string })
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

export function useLogin() {
  return useMutation({
    mutationFn: fetchLogin,
    onSuccess(data) {
      setTokens(data.access, data.token);
    },
  });
}

export function useToken() {
  return useQuery({
    queryKey: ["access_token"],
    queryFn: async () => {
      const refresh = getRefreshToken()!;
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/api/token/refresh/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh }),
        },
      );

      if (!res.ok) throw new Error("Failed to refresh access token.");

      const data = (await res.json()) as { access: string };
      setRefreshToken(refresh);
      localStorage.setItem("token", data.access);
      return data.access;
    },
    staleTime: 4 * 60 * 1000, // 1 min less than the actual token expiration
    retry: false,
    enabled: !!getRefreshToken(),
  });
}
