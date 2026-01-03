import { createApp } from "./app.js";
import { Environment } from "./shared/helpers/Environment.js";
import { fileURLToPath } from "url";

const startServer = async () => {
  try {
    // Reduce logging noise globally (overridable via LOG_LEVEL)

    const app = await createApp();
    const port = Environment.port;

    const server = app.listen(port, () => {
      console.warn(`API server started on port ${port} (${Environment.currentEnvironment})`);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      console.warn(`Received ${signal}, shutting down gracefully...`);
      server.close(() => {
        console.warn("Server closed");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Only start server if this file is run directly (not imported)
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  startServer();
}
