import { controller, httpGet } from "inversify-express-utils";
import express from "express";
import { Environment } from "../helpers/index.js";

@controller("/health")
export class HealthController {
  @httpGet("/database-connections")
  public async checkDatabaseConnections(_req: express.Request, res: express.Response): Promise<any> {
    try {
      const connectionStatus = Environment.getConnectionStatus();
      const allDatabaseConfigs = Environment.getAllDatabaseConfigs();

      // Test connection validity (basic check)
      const connectionDetails: Record<string, any> = {};
      for (const [moduleName, config] of allDatabaseConfigs.entries()) {
        connectionDetails[moduleName] = { configured: !!config };
      }

      const isHealthy = connectionStatus.missing.length === 0;
      const status = isHealthy ? "healthy" : "degraded";

      return res.status(isHealthy ? 200 : 503).json({
        status,
        timestamp: new Date().toISOString(),
        environment: Environment.currentEnvironment,
        summary: {
          total: connectionStatus.total,
          loaded: connectionStatus.loaded.length,
          missing: connectionStatus.missing.length
        },
        modules: {
          loaded: connectionStatus.loaded,
          missing: connectionStatus.missing
        },
        connections: connectionDetails
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        status: "error",
        timestamp: new Date().toISOString(),
        error: errorMessage
      });
    }
  }

  @httpGet("/")
  public async healthCheck(_req: express.Request, res: express.Response): Promise<any> {
    try {
      const connectionStatus = Environment.getConnectionStatus();
      const isHealthy = connectionStatus.missing.length === 0;

      // Simple health check response
      return res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        environment: Environment.currentEnvironment,
        uptime: process.uptime(),
        version: process.env.npm_package_version || "unknown"
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        status: "error",
        timestamp: new Date().toISOString(),
        error: errorMessage
      });
    }
  }

  @httpGet("/environment")
  public async environmentInfo(_req: express.Request, res: express.Response): Promise<any> {
    try {
      return res.json({
        environment: Environment.currentEnvironment,
        stage: process.env.STAGE || process.env.ENVIRONMENT || "unknown",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        status: "error",
        timestamp: new Date().toISOString(),
        error: errorMessage
      });
    }
  }
}
