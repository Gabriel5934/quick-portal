import { useRouter } from "@tanstack/react-router";

export function useLogout() {
  const router = useRouter();

  return () => {
    localStorage.removeItem("token");
    router.navigate({ to: "/" });
  };
}
