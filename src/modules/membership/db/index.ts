import { Kysely } from "kysely";
import { KyselyPool } from "../../../shared/infrastructure/KyselyPool.js";
import type { MembershipDatabase } from "./DatabaseTypes.js";

export function getDb(): Kysely<MembershipDatabase> {
  return KyselyPool.getDb<MembershipDatabase>("membership");
}
