import "reflect-metadata";
import express from "express";
import { Container } from "inversify";
import { InversifyExpressServer } from "inversify-express-utils";
import { Environment } from "./shared/helpers/Environment";
import { CustomAuthProvider } from "./shared/infrastructure/CustomAuthProvider";
import { RepositoryManager } from "./shared/infrastructure/RepositoryManager";
import cors from "cors";
import bodyParser from "body-parser";
import fileUpload from "express-fileupload";
import { ConnectionManager } from "./shared/infrastructure/ConnectionManager";
import { configureModuleRoutes, moduleRoutingLogger } from "./routes";

export const createApp = async () => {
  console.log("🚀 Starting createApp...");

  // Initialize environment configuration
  const environment = process.env.ENVIRONMENT || "dev";
  console.log(`📋 Initializing environment: ${environment}`);
  await Environment.init(environment);
  console.log("✅ Environment initialized");

  // Pools now auto-initialize on first use

  // Create Inversify container
  console.log("📦 Creating Inversify container...");
  const container = new Container();
  console.log("✅ Container created");

  // Load module bindings and controllers
  console.log("🔗 Loading module bindings...");
  await loadModuleBindings(container);
  console.log("✅ Module bindings loaded");

  // Create Express server with Inversify
  console.log("🌐 Creating Express server...");
  const server = new InversifyExpressServer(container, null, { rootPath: "" }, null, CustomAuthProvider);
  console.log("✅ Express server created");

  // Configure the server
  console.log("⚙️ Configuring server...");
  server.setConfig((app) => {
    // Configure CORS first
    app.use(
      cors({
        origin: function (origin, callback) {
          const allowedOrigins = Environment.corsOrigin ? Environment.corsOrigin.split(",").map((o) => o.trim()) : ["*"];
          if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error("Not allowed by CORS"));
          }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"]
      })
    );

    // Handle preflight requests early
    app.options("*", (req, res) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
      res.sendStatus(200);
    });

    // Handle body parsing - different strategies for Lambda vs local development
    const isLambdaEnvironment = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV;

    if (isLambdaEnvironment) {
      // Lambda-specific body parsing for @codegenie/serverless-express
      app.use((req, res, next) => {
        const contentType = req.headers["content-type"] || "";

        // Mark request as already having body parsed to prevent further body parsing attempts
        (req as any)._body = true;

        // Handle Buffer instances (most common case with serverless-express)
        if (Buffer.isBuffer(req.body)) {
          try {
            const bodyString = req.body.toString("utf8");
            if (contentType.includes("application/json")) {
              req.body = JSON.parse(bodyString);
            } else {
              req.body = bodyString;
            }
          } catch {
            req.body = {};
          }
        }
        // Handle Buffer-like objects
        else if (req.body && req.body.type === "Buffer" && Array.isArray(req.body.data)) {
          try {
            const bodyString = Buffer.from(req.body.data).toString("utf8");
            if (contentType.includes("application/json")) {
              req.body = JSON.parse(bodyString);
            } else {
              req.body = bodyString;
            }
          } catch {
            req.body = {};
          }
        }
        // Handle string JSON bodies
        else if (typeof req.body === "string" && req.body.length > 0) {
          try {
            if (contentType.includes("application/json")) {
              req.body = JSON.parse(req.body);
            }
          } catch {
            // Silently ignore JSON parse errors
          }
        }
        // If no body was provided, ensure body is set to prevent parsing attempts
        else if (!req.body) {
          req.body = {};
        }

        next();
      });
    } else {
      // Local development - use standard body-parser middleware
      app.use(bodyParser.json({ limit: "50mb" }));
      app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
    }

    // File upload middleware
    app.use(
      fileUpload({
        limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
        useTempFiles: true,
        tempFileDir: "/tmp/"
      })
    );

    // Module routing logger (for debugging)
    app.use(moduleRoutingLogger);

    // Configure module-specific routes and context middleware
    configureModuleRoutes(app);

    // Health check endpoint
    app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        environment: Environment.currentEnvironment,
        modules: ["attendance", "content", "doing", "giving", "membership", "messaging"]
      });
    });

    // API documentation endpoint
    app.get("/", (req, res) => {
      res.json({
        name: "Core API",
        version: "1.0.0",
        description: "Modular monolith for church management system",
        modules: {
          attendance: `${Environment.attendanceApi}/attendance`,
          content: `${Environment.contentApi}/content`,
          doing: `${Environment.doingApi}/doing`,
          giving: `${Environment.givingApi}/giving`,
          membership: `${Environment.membershipApi}/membership`,
          messaging: `${Environment.messagingApi}/messaging`
        }
      });
    });
  });
  console.log("✅ Server configuration complete");

  console.log("🛠️ Setting error config...");
  server.setErrorConfig((app) => {
    // Global error handler
    app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error("Global error handler:", error);

      const statusCode = error.statusCode || error.status || 500;
      const message = error.message || "Internal Server Error";

      res.status(statusCode).json({
        error: {
          message,
          status: statusCode,
          timestamp: new Date().toISOString(),
          path: req.path
        }
      });
    });

    // 404 handler
    app.use((req: express.Request, res: express.Response) => {
      res.status(404).json({
        error: {
          message: "Endpoint not found",
          status: 404,
          timestamp: new Date().toISOString(),
          path: req.path
        }
      });
    });
  });
  console.log("✅ Error config complete");

  console.log("🏗️ Building Express app...");
  const app = server.build();
  console.log("✅ Express app built");

  // Initialize messaging module after server is built but before returning
  console.log("💬 Initializing messaging module...");
  try {
    console.log("📥 Importing messaging modules...");
    const { initializeMessagingModule } = await import("./modules/messaging");
    const { Repositories } = await import("./modules/messaging/repositories");
    console.log("✅ Messaging modules imported");

    console.log("🗃️ Creating messaging repositories...");
    const messagingRepositories = Repositories.getCurrent();
    console.log("✅ Messaging repositories created");

    console.log("🔌 Initializing messaging module...");
    initializeMessagingModule(messagingRepositories);
    console.log("✅ Messaging module initialized");
  } catch (error) {
    console.warn("⚠️ Failed to initialize messaging module:", error.message);
    console.log("Continuing without messaging features...");
  }

  console.log("🎉 App creation complete!");
  return app;
};

async function loadModuleBindings(container: Container) {
  try {
    console.log("Loading module controllers and bindings...");

    // Load all module controllers which will self-register via decorators
    // The @controller decorators automatically register with the container

    // Import membership module controllers with proper prefix
    await import("./modules/membership/controllers");
    console.log("✓ Membership controllers loaded");

    // Import attendance module controllers
    await import("./modules/attendance/controllers");
    console.log("✓ Attendance controllers loaded");

    // Import content module controllers
    await import("./modules/content/controllers");
    console.log("✓ Content controllers loaded");

    // Import doing module controllers
    await import("./modules/doing/controllers");
    console.log("✓ Doing controllers loaded");

    // Import giving module controllers
    await import("./modules/giving/controllers");
    console.log("✓ Giving controllers loaded");

    // Import messaging module controllers
    await import("./modules/messaging/controllers");
    console.log("✓ Messaging controllers loaded");

    // Import reporting module controllers
    await import("./modules/reporting/controllers");
    console.log("✓ Reporting controllers loaded");

    // Set up repository manager as singleton
    container.bind<RepositoryManager>("RepositoryManager").toConstantValue(RepositoryManager);

    console.log("All module bindings loaded successfully");
  } catch (error) {
    console.error("Failed to load module bindings:", error);
    throw error;
  }
}

// Handle process termination
process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");

  // Close WebSocket server
  try {
    const { SocketHelper } = await import("./modules/messaging/helpers/SocketHelper");
    SocketHelper.shutdown();
  } catch (error) {
    console.warn("Failed to shutdown WebSocket server:", error.message);
  }

  // Close database connections
  await ConnectionManager.closeAll();
  process.exit(0);
});
