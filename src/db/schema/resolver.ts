/**
 * Schema resolver — returns the correct schema module based on DB_DIALECT.
 *
 * Usage in repos:
 *   import { getSchema } from "../../db/schema/resolver.js";
 *   const { campuses, visits } = getSchema("attendance");
 *
 * This avoids every repo needing conditional imports. The returned objects have
 * identical export names — only the underlying table builders (mysqlTable vs pgTable) differ.
 */
import { getDialect } from "../../shared/helpers/Dialect.js";

// MySQL schemas (existing)
import * as mysqlAttendance from "./attendance.js";
import * as mysqlContent from "./content.js";
import * as mysqlDoing from "./doing.js";
import * as mysqlGiving from "./giving.js";
import * as mysqlMembership from "./membership.js";
import * as mysqlMessaging from "./messaging.js";

// PostgreSQL schemas
import * as pgAttendance from "./pg/attendance.js";
import * as pgContent from "./pg/content.js";
import * as pgDoing from "./pg/doing.js";
import * as pgGiving from "./pg/giving.js";
import * as pgMembership from "./pg/membership.js";
import * as pgMessaging from "./pg/messaging.js";

type SchemaModule = "attendance" | "content" | "doing" | "giving" | "membership" | "messaging";

const mysqlSchemas: Record<SchemaModule, any> = {
  attendance: mysqlAttendance,
  content: mysqlContent,
  doing: mysqlDoing,
  giving: mysqlGiving,
  membership: mysqlMembership,
  messaging: mysqlMessaging
};

const pgSchemas: Record<SchemaModule, any> = {
  attendance: pgAttendance,
  content: pgContent,
  doing: pgDoing,
  giving: pgGiving,
  membership: pgMembership,
  messaging: pgMessaging
};

/**
 * Get the schema module for the given module name.
 * Returns MySQL tables when DB_DIALECT=mysql (default), PG tables when DB_DIALECT=postgres.
 */
export function getSchema<T extends SchemaModule>(moduleName: T): typeof mysqlSchemas[T] {
  return getDialect() === "postgres" ? pgSchemas[moduleName] : mysqlSchemas[moduleName];
}
