import { Kysely } from "kysely";
import { KyselyPool } from "../../../shared/infrastructure/KyselyPool.js";
import type { ContentDatabase } from "./DatabaseTypes.js";

export function getDb(): Kysely<ContentDatabase> {
  return KyselyPool.getDb<ContentDatabase>("content");
}
