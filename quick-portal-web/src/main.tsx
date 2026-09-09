import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StateMachineProvider } from "little-state-machine";
import "./index.css";
import App from "./App.tsx";
import "./features/recurring-fees/form-store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StateMachineProvider>
      <App />
    </StateMachineProvider>
  </StrictMode>,
);
