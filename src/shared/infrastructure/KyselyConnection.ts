import { Kysely, MysqlDialect } from "kysely";
import { createPool } from "mysql2";
import { DatabaseUrlParser } from "../helpers/DatabaseUrlParser.js";

/**
 * A standalone Kysely for one module, built from `<MODULE>_CONNECTION_STRING`.
 * Migrations use it (from the CLI and from the server-admin migration runner),
 * so it reads only process.env — no dotenv, no Environment bootstrap.
 */
export function getDbConfig(moduleName: string) {
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
      }
    })
  });

  return new Kysely({ dialect });
}
