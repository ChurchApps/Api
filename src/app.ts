import "reflect-metadata";
import express from "express";
import { Container } from "inversify";
import { InversifyExpressServer } from "inversify-express-utils";
import { Environment } from "./shared/helpers/Environment";
import { CustomAuthProvider } from "./shared/infrastructure/CustomAuthProvider";
import { RepoManager } from "./shared/infrastructure/RepoManager";
import cors from "cors";
import bodyParser from "body-parser";
import fileUpload from "express-fileupload";
import { ConnectionManager } from "./shared/infrastructure/ConnectionManager";
import { configureModuleRoutes, moduleRoutingLogger } from "./routes";

export const createApp = async () => {
  // Initialize environment configuration (only if not already initialized)
  const environment = process.env.ENVIRONMENT || "dev";

  if (!Environment.currentEnvironment) {
    await Environment.init(environment);
  }

  // Pools now auto-initialize on first use

  // Create Inversify container
  const container = new Container();

  // Load module bindings and controllers
  await loadModuleBindings(container);

  // Create Express server with Inversify
  const server = new InversifyExpressServer(container, null, { rootPath: "" }, null, CustomAuthProvider);

  // Configure the server
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
        // Check if this is a webhook endpoint that needs raw body
        const isWebhookEndpoint = req.path.includes("/donate/webhook/");

        // Mark request as already having body parsed to prevent further body parsing attempts
        (req as any)._body = true;

        // Handle Buffer instances (most common case with serverless-express)
        if (Buffer.isBuffer(req.body)) {
          try {
            const bodyString = req.body.toString("utf8");
            // Keep raw body for webhook endpoints, parse JSON for others
            if (!isWebhookEndpoint && contentType.includes("application/json")) {
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
            // Keep raw body for webhook endpoints, parse JSON for others
            if (!isWebhookEndpoint && contentType.includes("application/json")) {
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
            // Keep raw body for webhook endpoints, parse JSON for others
            if (!isWebhookEndpoint && contentType.includes("application/json")) {
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
      // Add raw body parser for webhook endpoints (Stripe requires raw body for signature verification)
      app.use(
        "/giving/donate/webhook/*",
        bodyParser.raw({ type: "application/json" })
      );

      // Standard JSON parsing for all other endpoints
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

  const app = server.build();

  // Initialize messaging module after server is built but before returning
  try {
    const { initializeMessagingModule } = await import("./modules/messaging");
    const { RepoManager } = await import("./shared/infrastructure/RepoManager");
    const messagingRepos = await RepoManager.getRepos<any>("messaging");
    initializeMessagingModule(messagingRepos);
  } catch (error) {
    console.warn("Failed to initialize messaging module:", (error as any)?.message || error);
  }
  return app;
};

async function loadModuleBindings(container: Container) {
  try {
    const startTime = Date.now();

    // Load all module controllers in parallel for faster startup
    // The @controller decorators automatically register with the container
    const moduleImports: Array<{ name: string; import: Promise<any> }> = [
      { name: "Shared", import: import("./shared/controllers/HealthController") },
      { name: "Membership", import: import("./modules/membership/controllers") },
      { name: "Attendance", import: import("./modules/attendance/controllers") },
      { name: "Content", import: import("./modules/content/controllers") },
      { name: "Doing", import: import("./modules/doing/controllers") },
      { name: "Giving", import: import("./modules/giving/controllers") },
      { name: "Messaging", import: import("./modules/messaging/controllers") },
      { name: "Reporting", import: import("./modules/reporting/controllers") }
    ];

    // Only load playground in development environment
    const env = Environment.currentEnvironment || process.env.ENVIRONMENT || "dev";
    if (env === "dev" || env === "development" || env === "local") {
      moduleImports.push({ name: "Playground", import: import("./playground/controllers") });
      console.log("🎮 Playground enabled (development mode)");
    }

    // Execute all imports in parallel
    const results = await Promise.allSettled(moduleImports.map((m) => m.import));

    // Report on each module's loading status
    results.forEach((result, index) => {
      const moduleName = moduleImports[index].name;
      if (result.status !== "fulfilled") {
        console.error(`Failed to load ${moduleName} controllers:`, (result as any).reason);
      }
    });

    // Check if any modules failed to load
    const failedModules = results.filter((r) => r.status === "rejected");
    if (failedModules.length > 0) console.warn(`${failedModules.length} module(s) failed to load; continuing...`);

    // Set up repository manager as singleton
    container.bind<RepoManager>("RepoManager").toConstantValue(RepoManager);

    const loadTime = Date.now() - startTime;
    if (loadTime > 2000) console.warn(`Module bindings loaded in ${loadTime}ms`);
  } catch (error) {
    console.error("Failed to load module bindings:", error);
    throw error;
  }
}

// Handle process termination
process.on("SIGINT", async () => {
  console.warn("SIGINT received, shutting down gracefully...");

  // Close WebSocket server
  try {
    const { SocketHelper } = await import("./modules/messaging/helpers/SocketHelper");
    SocketHelper.shutdown();
  } catch (error) {
    console.warn("Failed to shutdown WebSocket server:", (error as any)?.message || error);
  }

  // Close database connections
  await ConnectionManager.closeAll();
  process.exit(0);
});
