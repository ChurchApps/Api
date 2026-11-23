import { sql, UpdateObject } from "kysely";
import { getDb } from "../db/index.js";
import type { MembershipDatabase } from "../db/DatabaseTypes.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Batch } from "../models/index.js";

export class BatchRepo {
  public async create(batch: Batch): Promise<Batch> {
    batch.id = UniqueIdHelper.shortId();
    await getDb().insertInto("batches").values({
      id: batch.id,
      churchId: batch.churchId,
      userId: batch.userId,
      label: batch.label,
      source: batch.source,
      status: batch.status || "open",
      itemCount: batch.itemCount ?? 0,
      created: sql<Date>`NOW()`
    }).execute();
    return batch;
  }

  public async complete(churchId: string, id: string, itemCount: number): Promise<void> {
    await getDb().updateTable("batches")
      .set({ status: "completed", itemCount, completedAt: sql<Date>`NOW()` })
      .where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async setStatus(churchId: string, id: string, status: string, undone = false): Promise<void> {
    const patch: UpdateObject<MembershipDatabase, "batches"> = { status };
    if (undone) patch.undoneAt = sql<Date>`NOW()`;
    await getDb().updateTable("batches").set(patch).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Batch | null> {
    return (await getDb().selectFrom("batches").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) as Batch ?? null;
  }

  public async loadAll(churchId: string): Promise<Batch[]> {
    return getDb().selectFrom("batches").selectAll().where("churchId", "=", churchId).orderBy("created", "desc").limit(500).execute() as Promise<Batch[]>;
  }

  public convertToModel(_churchId: string, data: Batch) { return data; }
  public convertAllToModel(_churchId: string, data: Batch[]) { return data || []; }
}
