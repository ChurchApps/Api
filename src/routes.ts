import express from "express";

/**
 * Unified route configuration for the API modular monolith
 *
 * This module handles:
 * - Route prefixing for each module (/membership, /attendance, etc.)
 * - Middleware injection for module-specific context
 * - Repository context setup for each request
 */

/**
 * Module route prefixes mapping
 * Each module gets its own route namespace
 */
export const MODULE_ROUTES = {
  membership: "/membership",
  attendance: "/attendance",
  content: "/content",
  doing: "/doing",
  giving: "/giving",
  messaging: "/messaging",
  reporting: "/reporting"
} as const;

/**
 * Middleware to set up repository context for a specific module
 * This ensures the correct database connection is used for each module's requests
 */
export const createModuleContextMiddleware = (moduleName: string) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      // Import TypedDB to set up request context
      const { TypedDB } = await import("./shared/infrastructure/TypedDB.js");

      // Add module information to request for debugging/logging
      (req as any).module = moduleName;

      // Run the rest of the request handling within the module's database context
      await TypedDB.runWithContext(moduleName, async () => {
        next();
      });
    } catch (error) {
      console.error(`Error setting up context for module ${moduleName}:`, error);
      res.status(500).json({
        error: {
          message: "Module context initialization failed",
          module: moduleName,
          timestamp: new Date().toISOString()
        }
      });
    }
  };
};

/**
 * Configure module-specific routes with proper context middleware
 * This function is called by the main Express app setup
 */
export const configureModuleRoutes = (app: express.Application) => {
  // Configure middleware for each module route prefix
  Object.entries(MODULE_ROUTES).forEach(([moduleName, routePrefix]) => {
    const fullPrefix = routePrefix;
    const contextMiddleware = createModuleContextMiddleware(moduleName);

    // Apply module context middleware to all routes under this prefix
    app.use(fullPrefix, contextMiddleware);

    // Context middleware configured for module
  });

  // Add module information endpoint
  app.get("/modules", (_req, res) => {
    res.json({
      modules: Object.keys(MODULE_ROUTES).map((module) => ({
        name: module,
        prefix: MODULE_ROUTES[module as keyof typeof MODULE_ROUTES],
        status: "active"
      })),
      total: Object.keys(MODULE_ROUTES).length,
      timestamp: new Date().toISOString()
    });
  });

  // Module route configuration complete
};

/**
 * Get the route prefix for a specific module
 */
export const getModuleRoutePrefix = (moduleName: keyof typeof MODULE_ROUTES): string => {
  return MODULE_ROUTES[moduleName];
};

/**
 * Check if a request path belongs to a specific module
 */
export const isModuleRoute = (path: string, moduleName: keyof typeof MODULE_ROUTES): boolean => {
  const prefix = getModuleRoutePrefix(moduleName);
  return path.startsWith(prefix);
};

/**
 * Extract module name from a request path
 */
export const getModuleFromPath = (path: string): keyof typeof MODULE_ROUTES | null => {
  for (const [moduleName, routePrefix] of Object.entries(MODULE_ROUTES)) {
    if (path.startsWith(routePrefix)) {
      return moduleName as keyof typeof MODULE_ROUTES;
    }
  }
  return null;
};

/**
 * Middleware to log module routing for debugging
 */
export const moduleRoutingLogger = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
  const module = getModuleFromPath(req.path);
  if (module) {
    // Suppressed per-request logging by default to reduce noise
  }
  next();
};
