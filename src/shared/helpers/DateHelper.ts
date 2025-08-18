import moment from "moment-timezone";

/**
 * Shared date/time utilities for all modules
 * Provides consistent date handling across the monolith
 */
export class DateHelper {
  /**
   * Get current timestamp in MySQL format
   */
  static now(): string {
    return moment().format("YYYY-MM-DD HH:mm:ss");
  }

  /**
   * Convert date to MySQL format
   */
  static toMySqlFormat(date: Date | string): string {
    return moment(date).format("YYYY-MM-DD HH:mm:ss");
  }

  /**
   * Get current date in MySQL date format (no time)
   */
  static today(): string {
    return moment().format("YYYY-MM-DD");
  }

  /**
   * Convert to church's timezone
   * Can be extended to use church-specific timezone settings
   */
  static toChurchTime(date: Date | string, timezone?: string): string {
    const tz = timezone || "America/New_York"; // Default timezone
    return moment(date).tz(tz).format("YYYY-MM-DD HH:mm:ss");
  }

  /**
   * Add days to a date
   */
  static addDays(date: Date | string, days: number): string {
    return moment(date).add(days, "days").format("YYYY-MM-DD HH:mm:ss");
  }

  /**
   * Subtract days from a date
   */
  static subtractDays(date: Date | string, days: number): string {
    return moment(date).subtract(days, "days").format("YYYY-MM-DD HH:mm:ss");
  }

  /**
   * Get start of day
   */
  static startOfDay(date?: Date | string): string {
    return moment(date).startOf("day").format("YYYY-MM-DD HH:mm:ss");
  }

  /**
   * Get end of day
   */
  static endOfDay(date?: Date | string): string {
    return moment(date).endOf("day").format("YYYY-MM-DD HH:mm:ss");
  }

  /**
   * Check if date is valid
   */
  static isValid(date: any): boolean {
    return moment(date).isValid();
  }

  /**
   * Format for display (human readable)
   */
  static formatForDisplay(date: Date | string, format: string = "MMM DD, YYYY"): string {
    return moment(date).format(format);
  }

  /**
   * Get age from birthdate
   */
  static getAge(birthDate: Date | string): number {
    return moment().diff(moment(birthDate), "years");
  }

  /**
   * Legacy alias for toMySqlFormat (backward compatibility)
   */
  static toMysqlDate(date: Date | string): string {
    return this.toMySqlFormat(date);
  }
}
