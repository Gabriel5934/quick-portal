import { createApp } from "./app.js";
import { dataFile, onboardingMode, port } from "./config.js";
import { JsonStore } from "./store.js";

const store = new JsonStore(dataFile);
await store.initialize();

const server = createApp(store).listen(port, "0.0.0.0", () => {
  console.log(`Mock Cielo listening on port ${port} (${onboardingMode} mode)`);
});

const shutdown = () => {
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
