import mysql from "mysql2/promise";
import { Environment } from "../helpers/Environment";

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
        connectionLimit: 10
      });

      this.pools.set(moduleName, pool);
    }

    return pool;
  }

  /**
   * Convert MySQL bit fields to JavaScript booleans
   * MySQL returns bit(1) fields as Buffer objects, this converts them to proper booleans
   */
  private static convertBitFieldsToBoolean(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.convertBitFieldsToBoolean(item));
    }

    if (typeof data === "object") {
      const converted: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (Buffer.isBuffer(value) && value.length === 1) {
          // Convert MySQL bit(1) fields to boolean
          converted[key] = value[0] === 1;
        } else if (typeof value === "object") {
          converted[key] = this.convertBitFieldsToBoolean(value);
        } else {
          converted[key] = value;
        }
      }
      return converted;
    }

    return data;
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
        expandedSql = expandedSql.substring(0, placeholderPos) +
          placeholderReplacements +
          expandedSql.substring(placeholderPos + 1);

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
    const { sql: expandedSql, params: expandedParams } = this.expandArrayParams(sql, params);
    const [rows] = await pool.execute(expandedSql, expandedParams);
    return this.convertBitFieldsToBoolean(rows);
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
