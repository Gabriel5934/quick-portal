import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";
import { listenForLogout } from "#hooks/auth/session";
import { queryClient } from "./query-client";
import { router } from "./router";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

const theme = createTheme({
  components: {
    MuiCssBaseline: {
      styleOverrides: () => ({
        main: {
          display: "flex",
          flexDirection: "column",
        },
      }),
    },
  },
  palette: {
    primary: {
      main: "#A9260F",
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: "Inter",
  },
});

function App() {
  // A logout in another tab ends the session in this one too.
  useEffect(() => listenForLogout(queryClient), []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
