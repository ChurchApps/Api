import { Kysely, MysqlDialect } from "kysely";
import mysql from "mysql2";
import { Environment } from "../../src/shared/helpers/Environment.js";

export const MODULE_NAMES = [
  "membership",
  "attendance",
  "content",
  "giving",
  "messaging",
  "doing",
] as const;

export type ModuleName = (typeof MODULE_NAMES)[number];

let initialized = false;

export async function ensureEnvironment() {
  if (!initialized) {
    const env = process.env.ENVIRONMENT || "dev";
    await Environment.init(env);
    initialized = true;
  }
}

export function createKyselyForModule(moduleName: ModuleName): Kysely<any> {
  const dbConfig = Environment.getDatabaseConfig(moduleName);
  if (!dbConfig) {
    throw new Error(
      `No database configuration found for module: ${moduleName}`
    );
  }

  const dialect = new MysqlDialect({
    pool: mysql.createPool({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      port: dbConfig.port || 3306,
      connectionLimit: dbConfig.connectionLimit || 5,
      typeCast(field, next) {
        if (field.type === "BIT" && field.length === 1) {
          const bytes = field.buffer();
          return bytes ? bytes[0] === 1 : null;
        }
        return next();
      },
    }),
  });

  return new Kysely({ dialect });
}

export async function ensureDatabaseExists(moduleName: ModuleName) {
  const dbConfig = Environment.getDatabaseConfig(moduleName);
  if (!dbConfig) {
    throw new Error(
      `No database configuration found for module: ${moduleName}`
    );
  }

  const connection = await mysql
    .createPool({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port || 3306,
      connectionLimit: 1,
    })
    .promise();

  try {
    await connection.execute(
      `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``
    );
  } finally {
    await connection.end();
  }
}
