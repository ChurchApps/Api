import { Kysely, MysqlDialect } from "kysely";
import { createPool } from "mysql2";
import dotenv from "dotenv";
import { DatabaseUrlParser } from "../src/shared/helpers/DatabaseUrlParser.js";

const MODULES = ["membership", "attendance", "content", "giving", "messaging", "doing"] as const;
export type ModuleName = (typeof MODULES)[number];

let initialized = false;

export function getModules(): readonly string[] {
  return MODULES;
}

export async function ensureEnvironment() {
  if (!initialized) {
    dotenv.config();
    initialized = true;
  }
}

function getDbConfig(moduleName: string) {
  const envVar = `${moduleName.toUpperCase()}_CONNECTION_STRING`;
  const connString = process.env[envVar];
  if (!connString) {
    throw new Error(`Missing env var ${envVar} for module: ${moduleName}`);
  }
  return DatabaseUrlParser.parseConnectionString(connString);
}

export function createKysely(moduleName: string): Kysely<any> {
  const config = getDbConfig(moduleName);

  const dialect = new MysqlDialect({
    pool: createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      connectionLimit: 3,
      charset: "utf8mb4",
      typeCast(field: any, next: () => unknown) {
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

export async function ensureDatabaseExists(moduleName: string) {
  const config = getDbConfig(moduleName);

  const pool = createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    connectionLimit: 1,
  });

  try {
    await pool.promise().execute(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``);
  } finally {
    await pool.promise().end();
  }
}
