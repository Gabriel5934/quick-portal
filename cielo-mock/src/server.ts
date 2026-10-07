import { createApp } from "./app.js";
import {
  databaseFile,
  notificationScenario,
  notificationUrl,
  onboardingMode,
  port,
} from "./config.js";
import { SqliteStore } from "./store.js";

const store = new SqliteStore(databaseFile);

const server = createApp(store).listen(port, "0.0.0.0", () => {
  console.log(`Mock Cielo listening on port ${port} (${onboardingMode} mode)`);
  console.log(
    notificationUrl
      ? `Sending ${notificationScenario} onboarding notifications to ${notificationUrl}`
      : "Onboarding notifications are disabled",
  );
});

const shutdown = () => {
  server.close((error) => {
    store.close();
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
