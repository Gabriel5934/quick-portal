import { QueryClient } from "@tanstack/react-query";

// Shared by the React tree and the router context, so route guards read the
// same in-memory access token as the hooks.
export const queryClient = new QueryClient();
