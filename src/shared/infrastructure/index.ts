/**
 * Consolidated exports for shared infrastructure
 * Provides a single import point for infrastructure components
 */

export { ConnectionManager } from "./ConnectionManager.js";
export { RepoManager } from "./RepoManager.js";
export { CustomAuthProvider } from "./CustomAuthProvider.js";
export { BaseController } from "./BaseController.js";
export { DB, MultiDatabasePool } from "./DB.js";
export { BaseRepo } from "./BaseRepo.js";
export { ConfiguredRepo, type RepoConfig } from "./ConfiguredRepo.js";
export { TypedDB } from "./TypedDB.js";
