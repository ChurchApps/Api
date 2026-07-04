import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export class DateHelper {
  static now(): string {
    return dayjs().format("YYYY-MM-DD HH:mm:ss");
  }

  static toMySqlFormat(date: Date | string | null | undefined): string | null {
    if (date === null || date === undefined) return null;
    return dayjs(date).format("YYYY-MM-DD HH:mm:ss");
  }

  static today(): string {
    return dayjs().format("YYYY-MM-DD");
  }

  static toChurchTime(date: Date | string, timezone?: string): string {
    const tz = timezone || "America/New_York";
    return dayjs(date).tz(tz).format("YYYY-MM-DD HH:mm:ss");
  }

  static addDays(date: Date | string, days: number): string {
    return dayjs(date).add(days, "day").format("YYYY-MM-DD HH:mm:ss");
  }

  static subtractDays(date: Date | string, days: number): string {
    return dayjs(date).subtract(days, "day").format("YYYY-MM-DD HH:mm:ss");
  }

  static startOfDay(date?: Date | string): string {
    return dayjs(date).startOf("day").format("YYYY-MM-DD HH:mm:ss");
  }

  static endOfDay(date?: Date | string): string {
    return dayjs(date).endOf("day").format("YYYY-MM-DD HH:mm:ss");
  }

  static isValid(date: any): boolean {
    return dayjs(date).isValid();
  }

  static formatForDisplay(date: Date | string, format: string = "MMM DD, YYYY"): string {
    return dayjs(date).format(format);
  }

  static getAge(birthDate: Date | string): number {
    return dayjs().diff(dayjs(birthDate), "year");
  }

  /** Backward compatibility */
  static toMysqlDate(date: Date | string | null | undefined): string | null {
    return this.toMySqlFormat(date);
  }
  // Millisecond precision — required where sub-second ordering matters (e.g. audit-log conflict guard).
  static toMysqlDateMs(date: Date | string | null | undefined): string | null {
    if (date === null || date === undefined) return null;
    return dayjs(date).format("YYYY-MM-DD HH:mm:ss.SSS");
  }

  /** DATE-only fields: preserves calendar date without timezone conversion (e.g. birthDate, donationDate) */
  static toMysqlDateOnly(date: Date | string | null | undefined): string | null {
    if (date === null || date === undefined) return null;

    if (typeof date === "string") {
      const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
      return match ? match[1] : null;
    }

    // Use local date parts (not UTC) to preserve the calendar date
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}
