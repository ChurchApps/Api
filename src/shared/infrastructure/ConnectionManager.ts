import mysql from "mysql2/promise";
import { Environment } from "../helpers/Environment.js";

export class ConnectionManager {
  private static pools: Map<string, mysql.Pool> = new Map();

  static async getPool(moduleName: string): Promise<mysql.Pool> {
    if (!this.pools.has(moduleName)) {
      const dbConfig = Environment.getDatabaseConfig(moduleName);
      if (!dbConfig) {
        throw new Error(`Database configuration not found for module: ${moduleName}`);
      }

      const pool = mysql.createPool({
        host: dbConfig.host,
        port: dbConfig.port || 3306,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        connectionLimit: dbConfig.connectionLimit || 10,
        connectTimeout: 60000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
      });

      this.pools.set(moduleName, pool);
    }

    return this.pools.get(moduleName)!;
  }

  static async closeAll(): Promise<void> {
    const closePromises = Array.from(this.pools.values()).map((pool) => pool.end());
    await Promise.all(closePromises);
    this.pools.clear();
  }

  static async closePool(moduleName: string): Promise<void> {
    const pool = this.pools.get(moduleName);
    if (pool) {
      await pool.end();
      this.pools.delete(moduleName);
    }
  }

  static hasPool(moduleName: string): boolean {
    return this.pools.has(moduleName);
  }

  static getPoolCount(): number {
    return this.pools.size;
  }
}
