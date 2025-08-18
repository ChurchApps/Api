import { AsyncLocalStorage } from "async_hooks";
import { MultiDatabasePool } from "./MultiDatabasePool";

/**
 * Request context for storing the current module
 */
interface RequestContext {
  moduleName: string;
}

/**
 * Database access class that automatically uses the correct database
 * based on the current request context
 */
export class DB {
  // AsyncLocalStorage to maintain module context per request
  private static asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

  /**
   * Run a function with a specific module context
   * This is typically called by the module routing middleware
   */
  static async runWithContext<T>(moduleName: string, fn: () => Promise<T>): Promise<T> {
    return this.asyncLocalStorage.run({ moduleName }, fn);
  }

  /**
   * Get the current module name from the async context
   */
  private static getCurrentModule(): string {
    const context = this.asyncLocalStorage.getStore();
    if (!context?.moduleName) {
      throw new Error("No module context found. Make sure DB operations are called within a module route handler.");
    }
    return context.moduleName;
  }

  /**
   * Execute a query using the current module's database
   */
  static async query(sql: string, params?: any[]): Promise<any> {
    const moduleName = this.getCurrentModule();
    return MultiDatabasePool.query(moduleName, sql, params);
  }

  /**
   * Execute a query that returns a single row
   */
  static async queryOne(sql: string, params?: any[]): Promise<any> {
    const moduleName = this.getCurrentModule();
    return MultiDatabasePool.queryOne(moduleName, sql, params);
  }

  /**
   * Execute a query with explicit module name (for cross-module queries)
   */
  static async queryModule(moduleName: string, sql: string, params?: any[]): Promise<any> {
    return MultiDatabasePool.query(moduleName, sql, params);
  }

  /**
   * Execute a query that returns a single row with explicit module name
   */
  static async queryOneModule(moduleName: string, sql: string, params?: any[]): Promise<any> {
    return MultiDatabasePool.queryOne(moduleName, sql, params);
  }

  /**
   * Transaction support
   */
  static async transaction<T>(fn: (connection: any) => Promise<T>): Promise<T> {
    const moduleName = this.getCurrentModule();
    const pool = MultiDatabasePool.getPool(moduleName);
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const result = await fn(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get a connection for manual transaction handling
   */
  static async getConnection(): Promise<any> {
    const moduleName = this.getCurrentModule();
    const pool = MultiDatabasePool.getPool(moduleName);
    return pool.getConnection();
  }
}

// Re-export for convenience
export { MultiDatabasePool };
