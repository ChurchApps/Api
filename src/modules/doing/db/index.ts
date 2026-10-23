import { AsyncLocalStorage } from "node:async_hooks";
import { Kysely } from "kysely";
import { KyselyPool } from "../../../shared/infrastructure/KyselyPool.js";
import type { DoingDatabase } from "./DatabaseTypes.js";

// A confirmation lock keeps one connection across repo calls (including small
// Lambda pools). Autocommit remains enabled so action checkpoints are durable.
const connectionContext = new AsyncLocalStorage<Kysely<DoingDatabase>>();
export function withDoingConnection<T>(db: Kysely<DoingDatabase>, action: () => Promise<T>): Promise<T> {
  return connectionContext.run(db, action);
}

export function getDb(): Kysely<DoingDatabase> {
  return connectionContext.getStore() || KyselyPool.getDb<DoingDatabase>("doing");
}
