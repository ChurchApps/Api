/**
 * Shared validation utilities for all modules
 * Provides consistent validation patterns across the monolith
 */
export class ValidationHelper {
  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone number (basic format)
   */
  static isValidPhone(phone: string): boolean {
    if (!phone) return false;
    const phoneRegex = /^[\+]?[0-9\-\s\(\)\.]{10,}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Validate URL format
   */
  static isValidUrl(url: string): boolean {
    if (!url) return false;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate church ID format (8-character alphanumeric)
   */
  static isValidChurchId(churchId: string): boolean {
    if (!churchId) return false;
    return /^[a-zA-Z0-9]{8}$/.test(churchId);
  }

  /**
   * Validate user ID format
   */
  static isValidUserId(userId: string): boolean {
    if (!userId) return false;
    return /^[a-zA-Z0-9]{8,}$/.test(userId);
  }

  /**
   * Sanitize string input (remove potentially harmful characters)
   */
  static sanitizeString(input: string): string {
    if (!input) return "";
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/[<>]/g, "")
      .trim();
  }

  /**
   * Validate required fields in an object
   */
  static validateRequired(obj: any, requiredFields: string[]): string[] {
    const errors: string[] = [];
    for (const field of requiredFields) {
      if (!obj[field] || (typeof obj[field] === "string" && obj[field].trim() === "")) {
        errors.push(`${field} is required`);
      }
    }
    return errors;
  }

  /**
   * Validate string length
   */
  static validateLength(value: string, fieldName: string, min: number = 0, max: number = 255): string | null {
    if (!value) {
      return min > 0 ? `${fieldName} is required` : null;
    }
    if (value.length < min) {
      return `${fieldName} must be at least ${min} characters`;
    }
    if (value.length > max) {
      return `${fieldName} cannot exceed ${max} characters`;
    }
    return null;
  }

  /**
   * Validate numeric range
   */
  static validateRange(value: number, fieldName: string, min?: number, max?: number): string | null {
    if (isNaN(value)) {
      return `${fieldName} must be a valid number`;
    }
    if (min !== undefined && value < min) {
      return `${fieldName} must be at least ${min}`;
    }
    if (max !== undefined && value > max) {
      return `${fieldName} cannot exceed ${max}`;
    }
    return null;
  }

  /**
   * Validate date format and range
   */
  static validateDate(date: string, fieldName: string, minDate?: Date, maxDate?: Date): string | null {
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return `${fieldName} must be a valid date`;
    }
    if (minDate && parsedDate < minDate) {
      return `${fieldName} cannot be before ${minDate.toDateString()}`;
    }
    if (maxDate && parsedDate > maxDate) {
      return `${fieldName} cannot be after ${maxDate.toDateString()}`;
    }
    return null;
  }

  /**
   * Check if value is empty or whitespace
   */
  static isEmpty(value: any): boolean {
    return (
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "") ||
      (Array.isArray(value) && value.length === 0)
    );
  }
}
