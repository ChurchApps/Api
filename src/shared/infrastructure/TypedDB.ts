import { DB } from "./DB";

export class TypedDB {
  static async query<T = any>(sql: string, params: unknown[]): Promise<T> {
    return DB.query(sql, params) as Promise<T>;
  }

  static async queryOne<T = any>(sql: string, params: unknown[]): Promise<T> {
    return DB.queryOne(sql, params) as Promise<T>;
  }

  /**
   * Run a function with a specific module context
   * This is typically called by the module routing middleware
   */
  static async runWithContext<T>(moduleName: string, fn: () => Promise<T>): Promise<T> {
    return DB.runWithContext(moduleName, fn);
  }

  /**
   * Execute a query with explicit module name (for cross-module queries)
   */
  static async queryModule<T = any>(moduleName: string, sql: string, params?: any[]): Promise<T> {
    return DB.queryModule(moduleName, sql, params) as Promise<T>;
  }

  /**
   * Execute a query that returns a single row with explicit module name
   */
  static async queryOneModule<T = any>(moduleName: string, sql: string, params?: any[]): Promise<T> {
    return DB.queryOneModule(moduleName, sql, params) as Promise<T>;
  }

  /**
   * Transaction support
   */
  static async transaction<T>(fn: (connection: any) => Promise<T>): Promise<T> {
    return DB.transaction(fn);
  }

  /**
   * Get a connection for manual transaction handling
   */
  static async getConnection(): Promise<any> {
    return DB.getConnection();
  }
}
