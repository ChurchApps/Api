// Export public interfaces for other modules
export * from "./repositories/index.js";
export * from "./models/index.js";
export { AuthenticatedUser } from "./auth/index.js";
export * from "./helpers/index.js";
export * from "./constants/index.js";

// Export controllers for Inversify container registration
export * from "./controllers/index.js";

// Module configuration
export const membershipModuleName = "membership";
