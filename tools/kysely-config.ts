import { createPool } from "mysql2";
import dotenv from "dotenv";
import { createKysely, getDbConfig } from "../src/shared/infrastructure/KyselyConnection.js";

export { createKysely };

const MODULES = ["membership", "attendance", "content", "giving", "messaging", "doing", "commons"] as const;
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
