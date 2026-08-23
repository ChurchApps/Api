import { Kysely } from "kysely";
import { KyselyPool } from "../../../shared/infrastructure/KyselyPool.js";
import type { CommonsDatabase } from "./DatabaseTypes.js";

export function getDb(): Kysely<CommonsDatabase> {
  return KyselyPool.getDb<CommonsDatabase>("commons");
}
