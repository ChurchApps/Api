import mysql from "mysql2/promise";
import postgres from "postgres";
import { Environment } from "../helpers/Environment.js";
import { getDialect } from "../helpers/Dialect.js";

export class ConnectionManager {
  private static mysqlPools: Map<string, mysql.Pool> = new Map();
  private static pgClients: Map<string, postgres.Sql> = new Map();

  static async getPool(moduleName: string): Promise<mysql.Pool> {
    if (!this.mysqlPools.has(moduleName)) {
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

      this.mysqlPools.set(moduleName, pool);
    }

    return this.mysqlPools.get(moduleName)!;
  }

  static getPgClient(moduleName: string): postgres.Sql {
    if (!this.pgClients.has(moduleName)) {
      const dbConfig = Environment.getDatabaseConfig(moduleName);
      if (!dbConfig) {
        throw new Error(`Database configuration not found for module: ${moduleName}`);
      }

      const client = postgres({
        host: dbConfig.host,
        port: dbConfig.port || 5432,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        max: dbConfig.connectionLimit || 10
      });

      this.pgClients.set(moduleName, client);
    }

    return this.pgClients.get(moduleName)!;
  }

  static async closeAll(): Promise<void> {
    const mysqlClosePromises = Array.from(this.mysqlPools.values()).map((pool) => pool.end());
    await Promise.all(mysqlClosePromises);
    this.mysqlPools.clear();

    const pgClosePromises = Array.from(this.pgClients.values()).map((client) => client.end());
    await Promise.all(pgClosePromises);
    this.pgClients.clear();
  }

  static async closePool(moduleName: string): Promise<void> {
    if (getDialect() === "postgres") {
      const client = this.pgClients.get(moduleName);
      if (client) {
        await client.end();
        this.pgClients.delete(moduleName);
      }
    } else {
      const pool = this.mysqlPools.get(moduleName);
      if (pool) {
        await pool.end();
        this.mysqlPools.delete(moduleName);
      }
    }
  }

  static hasPool(moduleName: string): boolean {
    if (getDialect() === "postgres") {
      return this.pgClients.has(moduleName);
    }
    return this.mysqlPools.has(moduleName);
  }

  static getPoolCount(): number {
    if (getDialect() === "postgres") {
      return this.pgClients.size;
    }
    return this.mysqlPools.size;
  }
}
