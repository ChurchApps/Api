import dotenv from "dotenv";
import { createApp } from "./app.js";
import { Environment } from "./shared/helpers/Environment.js";
import { KyselyPool } from "./shared/infrastructure/KyselyPool.js";
import { startRailwayCron } from "./shared/infrastructure/RailwayCron.js";
import { fileURLToPath } from "url";

// Load .env for local dev. In Lambda there is no .env file; dotenv returns silently.
// Does not overwrite existing env vars — shell overrides still win.
dotenv.config();

const startServer = async () => {
  try {
    const app = await createApp();
    const port = Environment.port;

    const server = app.listen(port, () => {
      console.warn(`API server started on port ${port} (${Environment.currentEnvironment})`);
    });

    // Railway exposes one port per service: attach WS to the same HTTP listener.
    if (process.env.RAILWAY_ENVIRONMENT) {
      const { SocketHelper } = await import("./modules/messaging/helpers/SocketHelper.js");
      SocketHelper.attachToServer(server);
      startRailwayCron();
    }

    // Graceful shutdown — single handler for all cleanup
    let shuttingDown = false;
    const gracefulShutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.warn(`Received ${signal}, shutting down gracefully...`);

      // Close WebSocket server
      try {
        const { SocketHelper } = await import("./modules/messaging/helpers/SocketHelper.js");
        SocketHelper.shutdown();
      } catch (error) {
        console.warn("Failed to shutdown WebSocket server:", (error as any)?.message || error);
      }

      // Close database connections
      await KyselyPool.destroyAll();

      // Stop accepting new requests
      server.close(() => {
        console.warn("Server closed");
        process.exit(0);
      });

      // Force exit if server.close hangs
      setTimeout(() => process.exit(1), 10000);
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
