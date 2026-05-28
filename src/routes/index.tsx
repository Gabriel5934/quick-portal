import { createFileRoute, redirect } from "@tanstack/react-router";
import { LoginPage } from "../features/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ location }) => {
    if (localStorage.getItem("token")) {
      throw redirect({
        to: "/home",
        search: {
          // Use the current location to power a redirect after login
          // (Do not use `router.state.resolvedLocation` as it can
          // potentially lag behind the actual current location)
          redirect: location.href,
        },
      });
    }
  },
  component: LoginPage,
});
