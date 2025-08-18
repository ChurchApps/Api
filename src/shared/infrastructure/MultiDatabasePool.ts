import mysql from "mysql2/promise";
import { Environment } from "../helpers/Environment";

/**
 * Multi-database pool manager for API
 * Maintains separate connection pools for each module's database
 */
export class MultiDatabasePool {
  private static pools: Map<string, mysql.Pool> = new Map();
  private static configs: Map<string, any> = new Map();

  /**
   * Initialize all database pools based on Environment configuration
   */
  static async initializeAllPools(): Promise<void> {
    const modules = ["membership", "attendance", "content", "giving", "messaging", "doing"];

    for (const module of modules) {
      const dbConfig = Environment.getDatabaseConfig(module);
      if (dbConfig) {
        try {
          await this.initializePool(module, dbConfig);
        } catch (error) {
          console.warn(`⚠️ Skipping ${module} database - connection failed:`, error.message);
          // Continue with other modules instead of failing completely
        }
      } else {
        console.warn(`⚠️ No database configuration found for module: ${module}`);
      }
    }
  }

  /**
   * Initialize a pool for a specific module
   */
  static async initializePool(moduleName: string, dbConfig: any): Promise<void> {
    try {
      // Store the config for reference
      this.configs.set(moduleName, dbConfig);

      // Create the pool with the database config
      const pool = mysql.createPool({
        host: dbConfig.host,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        port: dbConfig.port || 3306,
        connectionLimit: dbConfig.connectionLimit || 10,
        waitForConnections: true,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
      });

      // Test the connection
      const connection = await pool.getConnection();
      await connection.ping();
      connection.release();

      this.pools.set(moduleName, pool);
      console.log(`✅ Database pool initialized for module: ${moduleName}`);
    } catch (error) {
      console.error(`❌ Failed to initialize pool for module ${moduleName}:`, error);
      throw error;
    }
  }

  /**
   * Get a pool for a specific module
   */
  static getPool(moduleName: string): mysql.Pool {
    const pool = this.pools.get(moduleName);
    if (!pool) {
      throw new Error(`No database pool found for module: ${moduleName}. Make sure to initialize pools first.`);
    }
    return pool;
  }

  /**
   * Execute a query on a specific module's database
   */
  static async query(moduleName: string, sql: string, params?: any[]): Promise<any> {
    const pool = this.getPool(moduleName);
    const [rows] = await pool.execute(sql, params || []);
    return rows;
  }

  /**
   * Execute a query that returns a single row
   */
  static async queryOne(moduleName: string, sql: string, params?: any[]): Promise<any> {
    const rows = await this.query(moduleName, sql, params);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  /**
   * Close all pools (for graceful shutdown)
   */
  static async closeAll(): Promise<void> {
    for (const [moduleName, pool] of this.pools) {
      try {
        await pool.end();
        console.log(`✅ Closed database pool for module: ${moduleName}`);
      } catch (error) {
        console.error(`❌ Error closing pool for module ${moduleName}:`, error);
      }
    }
    this.pools.clear();
    this.configs.clear();
  }

  /**
   * Get all initialized module names
   */
  static getInitializedModules(): string[] {
    return Array.from(this.pools.keys());
  }

  /**
   * Check if a module's pool is initialized
   */
  static isPoolInitialized(moduleName: string): boolean {
    return this.pools.has(moduleName);
  }
}
