/**
 * Common types and interfaces shared across all modules
 * Consolidates type definitions from the original microservices
 */

// Base interfaces that all entities should implement
export interface BaseEntity {
  id?: string;
  churchId: string;
  dateCreated?: Date | string;
  dateModified?: Date | string;
}

export interface NamedEntity extends BaseEntity {
  name: string;
}

export interface TimestampedEntity extends BaseEntity {
  dateCreated: Date | string;
  dateModified: Date | string;
}

// Common response patterns
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  totalCount: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
}

export interface SearchResponse<T> extends PaginatedResponse<T> {
  searchTerm?: string;
  filters?: Record<string, any>;
}

// Database connection configuration
export interface DatabaseConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  connectionLimit?: number;
  acquireTimeout?: number;
  timeout?: number;
  reconnect?: boolean;
}

// Module configuration
export interface ModuleConfig {
  name: string;
  database: DatabaseConfig;
  enabled: boolean;
  apiUrl?: string;
}

// Authentication and authorization
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  churchId: string;
  permissions: Permission[];
  roles: string[];
  token?: string;
}

export interface Permission {
  contentType: string;
  action: string;
}

export interface Role {
  id: string;
  name: string;
  churchId: string;
  permissions: Permission[];
}

// Address and contact information (used across multiple modules)
export interface Address {
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface ContactInfo {
  email?: string;
  homePhone?: string;
  mobilePhone?: string;
  workPhone?: string;
}

export interface Person extends BaseEntity {
  firstName: string;
  lastName: string;
  middleName?: string;
  prefix?: string;
  suffix?: string;
  nickName?: string;
  birthDate?: Date | string;
  gender?: string;
  maritalStatus?: string;
  anniversary?: Date | string;
  membershipStatus?: string;
  householdId?: string;
  householdRole?: string;
  contactInfo: ContactInfo;
  address: Address;
  photo?: string;
  notes?: string;
}

// File and media types
export interface FileUpload {
  id?: string;
  churchId: string;
  fileName: string;
  contentType: string;
  size: number;
  path: string;
  url?: string;
  thumbnailUrl?: string;
  uploadedBy?: string;
  dateCreated?: Date | string;
}

export interface MediaFile extends FileUpload {
  duration?: number;
  width?: number;
  height?: number;
  bitrate?: number;
}

// Search and filtering
export interface SearchFilter {
  field: string;
  operator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "like" | "in" | "notin";
  value: any;
}

export interface SortOrder {
  field: string;
  direction: "asc" | "desc";
}

export interface SearchCriteria {
  searchTerm?: string;
  filters?: SearchFilter[];
  sortBy?: SortOrder[];
  pageSize?: number;
  currentPage?: number;
}

// Configuration and settings
export interface Setting extends BaseEntity {
  keyName: string;
  value: string;
  isPublic?: boolean;
  description?: string;
}

export interface ChurchSettings {
  churchId: string;
  name: string;
  settings: Record<string, any>;
}

// Error handling
export interface ApiError {
  code: string;
  message: string;
  field?: string;
  value?: any;
}

export interface ValidationError extends ApiError {
  field: string;
  value: any;
}

// Event and audit logging
export interface AuditLog extends BaseEntity {
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

// Notification types
export interface Notification extends BaseEntity {
  recipientId: string;
  title: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  read: boolean;
  actionUrl?: string;
  data?: Record<string, any>;
}

// Export utility types
export type ModuleName = "attendance" | "content" | "doing" | "giving" | "membership" | "messaging";

export type Environment = "dev" | "demo" | "staging" | "prod";

export type PermissionAction = "view" | "edit" | "delete" | "admin" | "create";

export type ContentType = "People" | "Groups" | "Households" | "Attendance" | "Donations" | "Content" | "Settings" | "Forms" | "Plans" | "Messaging" | "Doing";

// Utility type for making properties optional
export type Partial<T> = {
  [P in keyof T]?: T[P];
};

// Utility type for making properties required
export type Required<T> = {
  [P in keyof T]-?: T[P];
};

// Utility type for picking specific properties
export type Pick<T, K extends keyof T> = {
  [P in K]: T[P];
};

// Utility type for omitting specific properties
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
