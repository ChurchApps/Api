/**
 * Main shared module exports
 * Provides a single import point for all shared functionality
 */

// Explicit exports to avoid naming conflicts
export { Environment } from "./helpers/Environment";
export { Permissions, permissionsList, type IPermission, type ApiName, type DisplaySection, type Actions } from "./helpers/Permissions";
export { UniqueIdHelper } from "./helpers/UniqueIdHelper";
export { DateHelper } from "./helpers/DateHelper";
export { ValidationHelper } from "./helpers/ValidationHelper";
export { StripeHelper } from "./helpers/StripeHelper";

// Infrastructure
export * from "./infrastructure";

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
} from "./types/common";
