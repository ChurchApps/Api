/**
 * Main shared module exports
 * Provides a single import point for all shared functionality
 */

// Explicit exports to avoid naming conflicts
export { Environment } from "./helpers/Environment.js";
export { Permissions, permissionsList, type IPermission, type ApiName, type DisplaySection, type Actions } from "./helpers/Permissions.js";
export { UniqueIdHelper } from "./helpers/UniqueIdHelper.js";
export { DateHelper } from "./helpers/DateHelper.js";
export { ValidationHelper } from "./helpers/ValidationHelper.js";
export { StripeHelper } from "./helpers/StripeHelper.js";

// Infrastructure
export * from "./infrastructure/index.js";

// Types (but not Environment type to avoid conflict)
export type {
  ApiResponse,
  ValidationError,
  ChurchSettings,
  ModuleName,
  Environment as EnvironmentType,
  PermissionAction,
  BaseEntity,
  NamedEntity,
  TimestampedEntity,
  PaginatedResponse,
  SearchResponse,
  DatabaseConfig,
  ModuleConfig,
  AuthenticatedUser,
  Permission,
  Role,
  Address,
  ContactInfo,
  Person,
  FileUpload,
  MediaFile,
  SearchFilter,
  SortOrder,
  SearchCriteria,
  Setting,
  ApiError,
  AuditLog,
  Notification,
  ContentType
} from "./types/common.js";
