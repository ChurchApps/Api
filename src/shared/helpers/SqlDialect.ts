/**
 * SQL dialect helper — provides database-specific SQL fragments.
 * Used in repos that have raw SQL to abstract MySQL vs PostgreSQL differences.
 */
import { sql } from "drizzle-orm";
import { getDialect } from "./Dialect.js";

export class SqlDialect {
  /**
   * Group dates by week and return the week start date.
   * MySQL: STR_TO_DATE(concat(year(col), ' ', week(col, 0), ' Sunday'), '%X %V %W')
   * PG:    date_trunc('week', col)
   */
  static weekGroup(column: string): ReturnType<typeof sql> {
    if (getDialect() === "postgres") {
      return sql.raw(`date_trunc('week', ${column})`);
    }
    return sql.raw(`STR_TO_DATE(concat(year(${column}), ' ', week(${column}, 0), ' Sunday'), '%X %V %W')`);
  }

  /**
   * Extract year from a date column.
   */
  static year(column: string): ReturnType<typeof sql> {
    if (getDialect() === "postgres") {
      return sql.raw(`EXTRACT(YEAR FROM ${column})::integer`);
    }
    return sql.raw(`year(${column})`);
  }

  /**
   * Extract week number from a date column.
   * MySQL: week(col, 0)  — week starts Sunday
   * PG:    EXTRACT(WEEK FROM col) — ISO week
   */
  static week(column: string): ReturnType<typeof sql> {
    if (getDialect() === "postgres") {
      return sql.raw(`EXTRACT(WEEK FROM ${column})::integer`);
    }
    return sql.raw(`week(${column}, 0)`);
  }

  /**
   * ISO year-week number (YYYYWW).
   * MySQL: YEARWEEK(col, 3)
   * PG:    EXTRACT(ISOYEAR FROM col) * 100 + EXTRACT(WEEK FROM col)
   */
  static yearWeek(column: string, mode: number = 3): ReturnType<typeof sql> {
    if (getDialect() === "postgres") {
      return sql.raw(`(EXTRACT(ISOYEAR FROM ${column})::integer * 100 + EXTRACT(WEEK FROM ${column})::integer)`);
    }
    return sql.raw(`YEARWEEK(${column}, ${mode})`);
  }

  /**
   * Format a date column.
   * MySQL: DATE_FORMAT(col, fmt)
   * PG:    to_char(col, fmt)
   */
  static dateFormat(column: string, mysqlFmt: string, pgFmt: string): ReturnType<typeof sql> {
    if (getDialect() === "postgres") {
      return sql.raw(`to_char(${column}, '${pgFmt}')`);
    }
    return sql.raw(`DATE_FORMAT(${column}, '${mysqlFmt}')`);
  }

  /**
   * IFNULL / COALESCE — both dialects support COALESCE, but MySQL has IFNULL.
   * We always use COALESCE for portability.
   */
  static ifNull(column: string, defaultVal: string): ReturnType<typeof sql> {
    return sql.raw(`COALESCE(${column}, ${defaultVal})`);
  }

  /**
   * Date subtraction with interval.
   * MySQL: DATE_SUB(NOW(), INTERVAL n MONTH)
   * PG:    NOW() - INTERVAL 'n months'
   */
  static dateSubMonths(months: string | number): ReturnType<typeof sql> {
    if (getDialect() === "postgres") {
      return sql.raw(`NOW() - INTERVAL '${months} months'`);
    }
    return sql.raw(`DATE_SUB(NOW(), INTERVAL ${months} MONTH)`);
  }

  /**
   * Date addition with days.
   * MySQL: DATE_ADD(col, INTERVAL n DAY)
   * PG:    col + INTERVAL 'n days'
   */
  static dateAddDays(column: string, days: string | number): ReturnType<typeof sql> {
    if (getDialect() === "postgres") {
      return sql.raw(`${column} + INTERVAL '${days} days'`);
    }
    return sql.raw(`DATE_ADD(${column}, INTERVAL ${days} DAY)`);
  }

  /**
   * TIMESTAMPDIFF in days.
   * MySQL: TIMESTAMPDIFF(DAY, a, b)
   * PG:    EXTRACT(EPOCH FROM (b - a)) / 86400
   */
  static timestampDiffDays(from: string, to: string): ReturnType<typeof sql> {
    if (getDialect() === "postgres") {
      return sql.raw(`EXTRACT(EPOCH FROM (${to} - ${from})) / 86400`);
    }
    return sql.raw(`TIMESTAMPDIFF(DAY, ${from}, ${to})`);
  }

  /**
   * Escape a reserved word as a table/column identifier.
   * MySQL: backtick (`groups`)
   * PG:    double-quote ("groups")
   */
  static escapeId(identifier: string): string {
    if (getDialect() === "postgres") {
      return `"${identifier}"`;
    }
    return `\`${identifier}\``;
  }

  /**
   * Boolean literal.
   * MySQL: 0 / 1
   * PG:    false / true
   */
  static boolFalse(): string {
    return getDialect() === "postgres" ? "false" : "0";
  }

  static boolTrue(): string {
    return getDialect() === "postgres" ? "true" : "1";
  }

  /**
   * NOW() with hour offset.
   * MySQL: DATE_ADD(NOW(), INTERVAL 6 HOUR)
   * PG:    NOW() + INTERVAL '6 hours'
   */
  static nowPlusHours(hours: number): ReturnType<typeof sql> {
    if (getDialect() === "postgres") {
      return sql.raw(`NOW() + INTERVAL '${hours} hours'`);
    }
    return sql.raw(`DATE_ADD(NOW(), INTERVAL ${hours} HOUR)`);
  }

  /**
   * NOW() minus hours.
   */
  static nowMinusHours(hours: number): ReturnType<typeof sql> {
    if (getDialect() === "postgres") {
      return sql.raw(`NOW() - INTERVAL '${hours} hours'`);
    }
    return sql.raw(`DATE_SUB(NOW(), INTERVAL ${hours} HOUR)`);
  }

  /**
   * NOW() minus days.
   */
  static nowMinusDays(days: number): ReturnType<typeof sql> {
    if (getDialect() === "postgres") {
      return sql.raw(`NOW() - INTERVAL '${days} days'`);
    }
    return sql.raw(`DATE_ADD(NOW(), INTERVAL -${days} DAY)`);
  }

  /**
   * REPLACE() string function — same syntax in both dialects.
   */
  static replace(column: string, from: string, to: string): string {
    return `REPLACE(${column}, '${from}', '${to}')`;
  }

  /**
   * Dual table for INSERT...SELECT.
   * MySQL: FROM dual
   * PG:    (no FROM needed, or use VALUES)
   */
  static dualFrom(): string {
    return getDialect() === "postgres" ? "" : "FROM dual";
  }

  /**
   * Get affected rows from INSERT result.
   * MySQL: result[0].affectedRows
   * PG:    result.count
   */
  static getAffectedRows(result: any): number {
    if (getDialect() === "postgres") {
      return result?.count ?? 0;
    }
    const rows = Array.isArray(result) ? result[0] : result;
    return rows?.affectedRows ?? 0;
  }
}
