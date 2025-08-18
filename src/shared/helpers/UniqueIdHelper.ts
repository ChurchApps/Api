import { v4 as uuidv4 } from "uuid";

/**
 * Utility for generating unique IDs consistently across all modules
 * Consolidates ID generation patterns from the original microservices
 */
export class UniqueIdHelper {
  /**
   * Generate a short unique ID (8 characters)
   * Used throughout the system for database primary keys
   */
  static shortId(): string {
    return uuidv4().replace(/-/g, "").substring(0, 8);
  }

  /**
   * Generate a full UUID
   * Used for external references and longer-lived identifiers
   */
  static uuid(): string {
    return uuidv4();
  }

  /**
   * Generate a timestamp-based ID for ordering
   * Useful for time-sensitive records
   */
  static timestampId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}${random}`;
  }

  /**
   * Generate a church-scoped unique ID
   * Ensures uniqueness within a church context
   */
  static churchScopedId(_churchId: string): string {
    const id = this.shortId();
    // For database uniqueness, we just return the short ID
    // The church scoping is handled at the database level
    return id;
  }

  /**
   * Check if a value is missing or empty (backward compatibility)
   */
  static isMissing(value: any): boolean {
    return value === undefined || value === null || value === "";
  }
}
