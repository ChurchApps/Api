import { Kysely } from "kysely";
import { KyselyPool } from "../../../shared/infrastructure/KyselyPool.js";
import type { MessagingDatabase } from "./DatabaseTypes.js";

export function getDb(): Kysely<MessagingDatabase> {
  return KyselyPool.getDb<MessagingDatabase>("messaging");
}
