import "reflect-metadata";
import express from "express";
import { Container } from "inversify";
import { InversifyExpressServer } from "inversify-express-utils";
import { Environment } from "./shared/helpers/Environment.js";
import { CustomAuthProvider } from "./shared/infrastructure/CustomAuthProvider.js";
import { RepoManager } from "./shared/infrastructure/RepoManager.js";
import cors from "cors";
import bodyParser from "body-parser";
import fileUpload from "express-fileupload";
import { configureModuleRoutes, moduleRoutingLogger } from "./routes.js";

export const createApp = async () => {
  const environment = process.env.ENVIRONMENT || "dev";

  if (!Environment.currentEnvironment) {
    await Environment.init(environment);
  }

  const container = new Container();

  await loadModuleBindings(container);

  const server = new InversifyExpressServer(container, null, { rootPath: "" }, null, CustomAuthProvider);

  server.setConfig((app) => {
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

    app.options("*", (_req, res) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
      res.sendStatus(200);
    });

    const isLambdaEnvironment = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV;

    if (isLambdaEnvironment) {
      app.use((req, _res, next) => {
        const contentType = req.headers["content-type"] || "";
        const isWebhookEndpoint = req.path.includes("/donate/webhook/");

        (req as any)._body = true;

        if (Buffer.isBuffer(req.body)) {
          try {
            const bodyString = req.body.toString("utf8");
            if (!isWebhookEndpoint && contentType.includes("application/json")) {
              req.body = JSON.parse(bodyString);
            } else {
              req.body = bodyString;
            }
          } catch {
            req.body = {};
          }
        } else if (req.body && req.body.type === "Buffer" && Array.isArray(req.body.data)) {
          try {
            const bodyString = Buffer.from(req.body.data).toString("utf8");
            if (!isWebhookEndpoint && contentType.includes("application/json")) {
              req.body = JSON.parse(bodyString);
            } else {
              req.body = bodyString;
            }
          } catch {
            req.body = {};
          }
        } else if (typeof req.body === "string" && req.body.length > 0) {
          try {
            if (!isWebhookEndpoint && contentType.includes("application/json")) {
              req.body = JSON.parse(req.body);
            }
          } catch {
          }
        } else if (!req.body) {
          req.body = {};
        }

        next();
      });
    } else {
      app.use(
        "/giving/donate/webhook/*",
        bodyParser.raw({ type: "application/json" })
      );

      app.use(bodyParser.json({ limit: "50mb" }));
      app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
    }

    app.use(
      fileUpload({
        limits: { fileSize: 50 * 1024 * 1024 },
        useTempFiles: true,
        tempFileDir: "/tmp/"
      })
    );

    // Disk file store writes to ./content and builds URLs as CONTENT_ROOT + key; serve them back here.
    // Falls through to the content module's named routes when no file matches.
    if (Environment.fileStore !== "S3") app.use("/content", express.static("content"));

    app.use(moduleRoutingLogger);

    configureModuleRoutes(app);

    app.get("/health", (_req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        environment: Environment.currentEnvironment,
        modules: ["attendance", "content", "doing", "giving", "membership", "messaging"]
      });
    });

    app.get("/", (_req, res) => {
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
    app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
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

  // Wire MCP module for in-process dispatch and route inventory.
  try {
    const { setExpressApp, buildRouteInventory } = await import("./modules/mcp/index.js");
    setExpressApp(app);
    const routes = buildRouteInventory();
    console.log(`📡 MCP server ready at /mcp — ${routes.length} routes in inventory`);
  } catch (error) {
    console.warn("Failed to initialize MCP module:", (error as any)?.message || error);
  }

  try {
    const { initializeMessagingModule } = await import("./modules/messaging/index.js");
    const { RepoManager } = await import("./shared/infrastructure/RepoManager.js");
    const messagingRepos = await RepoManager.getRepos<any>("messaging");
    initializeMessagingModule(messagingRepos);
  } catch (error) {
    console.warn("Failed to initialize messaging module:", (error as any)?.message || error);
  }

  try {
    const { initializeDoingModule } = await import("./modules/doing/index.js");
    initializeDoingModule();
  } catch (error) {
    console.warn("Failed to initialize doing module:", (error as any)?.message || error);
  }
  return app;
};

async function loadModuleBindings(container: Container) {
  try {
    const startTime = Date.now();

    const moduleImports: Array<{ name: string; import: Promise<any> }> = [
      { name: "Shared", import: import("./shared/controllers/HealthController.js") },
      { name: "Membership", import: import("./modules/membership/controllers/index.js") },
      { name: "Attendance", import: import("./modules/attendance/controllers/index.js") },
      { name: "Content", import: import("./modules/content/controllers/index.js") },
      { name: "Doing", import: import("./modules/doing/controllers/index.js") },
      { name: "Giving", import: import("./modules/giving/controllers/index.js") },
      { name: "Messaging", import: import("./modules/messaging/controllers/index.js") },
      { name: "Reporting", import: import("./modules/reporting/controllers/index.js") },
      { name: "MCP", import: import("./modules/mcp/index.js") }
    ];

    const env = Environment.currentEnvironment || process.env.ENVIRONMENT || "dev";
    if (env === "dev" || env === "development" || env === "local") {
      moduleImports.push({ name: "Playground", import: import("./playground/controllers/index.js") });
      console.log("🎮 Playground enabled (development mode)");
    }

    const results = await Promise.allSettled(moduleImports.map((m) => m.import));

    results.forEach((result, index) => {
      const moduleName = moduleImports[index].name;
      if (result.status !== "fulfilled") {
        console.error(`Failed to load ${moduleName} controllers:`, (result as any).reason);
      }
    });

    const failedModules = results.filter((r) => r.status === "rejected");
    if (failedModules.length > 0) console.warn(`${failedModules.length} module(s) failed to load; continuing...`);

    container.bind<RepoManager>("RepoManager").toConstantValue(RepoManager);

    const loadTime = Date.now() - startTime;
    if (loadTime > 2000) console.warn(`Module bindings loaded in ${loadTime}ms`);
  } catch (error) {
    console.error("Failed to load module bindings:", error);
    throw error;
  }
}

