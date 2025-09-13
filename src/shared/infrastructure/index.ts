/**
 * Consolidated exports for shared infrastructure
 * Provides a single import point for infrastructure components
 */

export { ConnectionManager } from "./ConnectionManager";
export { RepositoryManager } from "./RepositoryManager";
export { CustomAuthProvider } from "./CustomAuthProvider";
export { BaseController } from "./BaseController";
export { DB, MultiDatabasePool } from "./DB";
export { BaseRepository } from "./BaseRepository";
export { ConfiguredRepository, type RepoConfig } from "./ConfiguredRepository";
