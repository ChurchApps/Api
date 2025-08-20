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

  static async query(moduleName: string, sql: string, params?: any[]): Promise<any> {
    const pool = this.getPool(moduleName);
    const [rows] = await pool.execute(sql, params || []);
    return rows;
  }

  static async queryOne(moduleName: string, sql: string, params?: any[]): Promise<any> {
    const rows = await this.query(moduleName, sql, params);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  static async closeAll(): Promise<void> {
    for (const pool of this.pools.values()) {
      await pool.end();
    }
    this.pools.clear();
  }
}
