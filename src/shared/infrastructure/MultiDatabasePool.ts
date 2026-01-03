import mysql from "mysql2/promise";
import { Environment } from "../helpers/Environment.js";

/**
 * Multi-database pool manager for API
 * Maintains separate connection pools for each module's database
 */
export class MultiDatabasePool {
  private static pools: Map<string, mysql.Pool> = new Map();

  static getPool(moduleName: string): mysql.Pool {
    let pool = this.pools.get(moduleName);

    if (!pool) {
      const dbConfig = Environment.getDatabaseConfig(moduleName);
      if (!dbConfig) {
        throw new Error(`No database config for module: ${moduleName}`);
      }

      pool = mysql.createPool({
        host: dbConfig.host,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        port: dbConfig.port || 3306,
        connectionLimit: 10,
        typeCast: function (field, next) {
          // Convert BIT(1) fields to boolean
          if (field.type === "BIT" && field.length === 1) {
            const bytes = field.buffer();
            return bytes ? bytes[0] === 1 : null;
          }
          return next();
        }
      });

      this.pools.set(moduleName, pool);
    }

    return pool;
  }

  /**
   * Sanitizes parameters by converting undefined to null
   * This prevents "Bind parameters must not contain undefined" errors
   */
  private static sanitizeParams(params?: any[]): any[] {
    if (!params) return [];
    return params.map((param) => {
      if (param === undefined) return null;
      if (Array.isArray(param)) {
        return param.map((item) => (item === undefined ? null : item));
      }
      return param;
    });
  }

  /**
   * Expands arrays in SQL IN clauses
   * Converts: SELECT * FROM table WHERE id IN (?) with params [churchId, [1,2,3]]
   * To: SELECT * FROM table WHERE id IN (?,?,?) with params [churchId, 1, 2, 3]
   */
  private static expandArrayParams(sql: string, params?: any[]): { sql: string; params: any[] } {
    if (!params || params.length === 0) {
      return { sql, params: params || [] };
    }

    let expandedSql = sql;
    const expandedParams: any[] = [];

    // Find all ? placeholders in the SQL
    const placeholders = expandedSql.match(/\?/g) || [];
    let placeholderIndex = 0;
    let sqlOffset = 0;

    for (let i = 0; i < params.length && placeholderIndex < placeholders.length; i++) {
      const param = params[i];

      if (Array.isArray(param) && param.length > 0) {
        // Find the position of the current placeholder
        const placeholderPos = expandedSql.indexOf("?", sqlOffset);
        if (placeholderPos === -1) break;

        // Create the replacement placeholders
        const placeholderReplacements = param.map(() => "?").join(",");

        // Replace this specific placeholder
        expandedSql = expandedSql.substring(0, placeholderPos) + placeholderReplacements + expandedSql.substring(placeholderPos + 1);

        // Update the offset for the next search
        sqlOffset = placeholderPos + placeholderReplacements.length;

        // Add all array elements to params
        expandedParams.push(...param);
      } else {
        // Non-array parameter, just add it
        expandedParams.push(param);

        // Update offset to skip past this placeholder
        const placeholderPos = expandedSql.indexOf("?", sqlOffset);
        if (placeholderPos !== -1) {
          sqlOffset = placeholderPos + 1;
        }
      }
      placeholderIndex++;
    }

    return { sql: expandedSql, params: expandedParams };
  }

  static async query(moduleName: string, sql: string, params?: any[]): Promise<any> {
    const pool = this.getPool(moduleName);
    const sanitizedParams = this.sanitizeParams(params);
    const { sql: expandedSql, params: expandedParams } = this.expandArrayParams(sql, sanitizedParams);
    const [rows] = await pool.execute(expandedSql, expandedParams);
    return rows;
  }

  static async queryOne(moduleName: string, sql: string, params?: any[]): Promise<any> {
    const rows = await this.query(moduleName, sql, params);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  static async executeDDL(moduleName: string, sql: string): Promise<any> {
    const pool = this.getPool(moduleName);
    const [result] = await pool.query(sql);
    return result;
  }

  static async closeAll(): Promise<void> {
    for (const pool of this.pools.values()) {
      await pool.end();
    }
    this.pools.clear();
  }
}
