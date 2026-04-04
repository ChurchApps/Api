import { Kysely } from "kysely";
import { KyselyPool } from "../../../shared/infrastructure/KyselyPool.js";
import type { DoingDatabase } from "./DatabaseTypes.js";

export function getDb(): Kysely<DoingDatabase> {
  return KyselyPool.getDb<DoingDatabase>("doing");
}
