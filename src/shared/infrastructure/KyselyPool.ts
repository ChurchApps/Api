import { Kysely, MysqlDialect } from "kysely";
import { createPool } from "mysql2";
import { Environment } from "../helpers/Environment.js";

/**
 * Multi-database Kysely instance manager for API.
 * Maintains separate Kysely instances for each module's database,
 * replacing MultiDatabasePool with type-safe Kysely queries.
 */
export class KyselyPool {
  private static instances: Map<string, Kysely<any>> = new Map();

  private static getPoolSize(): number {
    if (process.env.CONNECTION_POOL_SIZE) return parseInt(process.env.CONNECTION_POOL_SIZE, 10);
    // Lambda has limited connections — default to 2 per module
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) return 2;
    return 5;
  }

  static getDb<T>(moduleName: string): Kysely<T> {
    let instance = this.instances.get(moduleName);

    if (!instance) {
      const dbConfig = Environment.getDatabaseConfig(moduleName);
      if (!dbConfig) {
        throw new Error(`No database config for module: ${moduleName}`);
      }

      instance = new Kysely<T>({
        dialect: new MysqlDialect({
          pool: createPool({
            host: dbConfig.host,
            port: dbConfig.port || 3306,
            database: dbConfig.database,
            user: dbConfig.user,
            password: dbConfig.password,
            connectionLimit: this.getPoolSize(),
            connectTimeout: 60000,
            waitForConnections: true,
            queueLimit: 9999,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0,
            charset: "utf8mb4",
            typeCast: function castField(field: any, useDefaultTypeCasting: () => unknown) {
              if (field.type === "BIT" && field.length === 1) {
                try {
                  const bytes = field.buffer();
                  return bytes[0] === 1;
                } catch {
                  return false;
                }
              }
              return useDefaultTypeCasting();
            }
          })
        })
      });

      this.instances.set(moduleName, instance);
    }

    return instance as Kysely<T>;
  }

  static async destroyAll(): Promise<void> {
    for (const instance of this.instances.values()) {
      await instance.destroy();
    }
    this.instances.clear();
  }
}
