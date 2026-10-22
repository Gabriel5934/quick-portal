import "./instrument";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { reactErrorHandler } from "@sentry/react";
import { StateMachineProvider } from "little-state-machine";
import "./index.css";
import App from "./App.tsx";
import "./features/recurring-fees/form-store";

// Passing a callback marks the error as handled in Sentry. Custom handlers also
// replace React's default console logging, which this restores.
const logHandledError = (error: unknown) => {
  console.error(error);
};

createRoot(document.getElementById("root")!, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(logHandledError),
  onRecoverableError: reactErrorHandler(logHandledError),
}).render(
  <StrictMode>
    <StateMachineProvider>
      <App />
    </StateMachineProvider>
  </StrictMode>,
);
