import { Kysely } from "kysely";
import { KyselyPool } from "../../../shared/infrastructure/KyselyPool.js";
import type { AttendanceDatabase } from "./DatabaseTypes.js";

export function getDb(): Kysely<AttendanceDatabase> {
  return KyselyPool.getDb<AttendanceDatabase>("attendance");
}
