import { Kysely } from "kysely";
import { KyselyPool } from "../../../shared/infrastructure/KyselyPool.js";
import type { GivingDatabase } from "./DatabaseTypes.js";

export function getDb(): Kysely<GivingDatabase> {
  return KyselyPool.getDb<GivingDatabase>("giving");
}
