// Export public interfaces for other modules
export * from "./repositories/index.js";
export * from "./models/index.js";

// Export controllers for Inversify container registration
export * from "./controllers/index.js";

// Export helpers for external use
export * from "./helpers/index.js";

// Module configuration
export const contentModuleName = "content";
