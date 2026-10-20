import "./instrument";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { reactErrorHandler } from "@sentry/react";
import { StateMachineProvider } from "little-state-machine";
import "./index.css";
import App from "./App.tsx";
import "./features/recurring-fees/form-store";

createRoot(document.getElementById("root")!, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <StrictMode>
    <StateMachineProvider>
      <App />
    </StateMachineProvider>
  </StrictMode>,
);
