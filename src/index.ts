import { createApp } from "./app";
import { Environment } from "./shared/helpers/Environment";
import { MODULE_ROUTES } from "./routes";

const startServer = async () => {
  try {
    console.log("🚀 Starting API modular monolith...");

    const app = await createApp();
    const port = Environment.port;

    const server = app.listen(port, () => {
      console.log("");
      console.log("✅ Apis server started successfully!");
      console.log(`📍 Port: ${port}`);
      console.log(`🌍 Environment: ${Environment.currentEnvironment}`);
      console.log("");
      console.log("📋 Available endpoints:");
      console.log(`   Health check: http://localhost:${port}/health`);
      console.log(`   API docs: http://localhost:${port}/`);
      console.log(`   Modules info: http://localhost:${port}/modules`);
      console.log("");
      console.log("🔗 Module endpoints:");
      Object.entries(MODULE_ROUTES).forEach(([module, prefix]) => {
        console.log(`   ${module}: http://localhost:${port}${prefix}`);
      });
      console.log("");
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      server.close(() => {
        console.log("Server closed");
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
if (require.main === module) {
  startServer();
}
