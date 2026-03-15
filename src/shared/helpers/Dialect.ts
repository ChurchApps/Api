/**
 * Database dialect detection.
 * Reads DB_DIALECT env var: "mysql" (default) or "postgres".
 */
export type DbDialect = "mysql" | "postgres";

export function getDialect(): DbDialect {
  const d = (process.env.DB_DIALECT || "mysql").toLowerCase();
  if (d === "postgres" || d === "postgresql" || d === "pg") return "postgres";
  return "mysql";
}
