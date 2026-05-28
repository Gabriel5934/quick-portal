import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { clearTokens, getRefreshToken } from "./auth/storage";

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return async () => {
    const refresh = getRefreshToken();
    if (refresh) {
      try {
        await fetch(
          `${import.meta.env.VITE_API_BASE_URL}/api/token/blacklist/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh }),
          },
        );
      } catch {
        // swallow errors — logout proceeds regardless
      }
    }
    clearTokens();
    queryClient.clear();
    await navigate({ to: "/" });
  };
}
