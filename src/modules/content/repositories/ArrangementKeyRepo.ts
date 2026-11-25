import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { ArrangementKey } from "../models/index.js";

@injectable()
export class ArrangementKeyRepo {
  public async save(model: ArrangementKey) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: ArrangementKey): Promise<ArrangementKey> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("arrangementKeys").values({
      id: model.id,
      churchId: model.churchId,
      arrangementId: model.arrangementId,
      keySignature: model.keySignature,
      shortDescription: model.shortDescription
    }).execute();
    return model;
  }

  private async update(model: ArrangementKey): Promise<ArrangementKey> {
    await getDb().updateTable("arrangementKeys").set({
      arrangementId: model.arrangementId,
      keySignature: model.keySignature,
      shortDescription: model.shortDescription
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("arrangementKeys").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<ArrangementKey | undefined> {
    return (await getDb().selectFrom("arrangementKeys").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<ArrangementKey[]> {
    return getDb().selectFrom("arrangementKeys").selectAll().where("churchId", "=", churchId).execute();
  }

  // arrangementKeys has no index on arrangementId, so a DELETE filtered by it scans the table and
  // locks every row it reads: bulk song deletes queued one at a time until requests timed out.
  // Read the ids first (a plain select takes no locks), then delete only those rows by primary key.
  public async deleteForArrangement(churchId: string, arrangementId: string) {
    const rows = await getDb().selectFrom("arrangementKeys").select("id").where("churchId", "=", churchId).where("arrangementId", "=", arrangementId).execute();
    if (rows.length === 0) return;
    await getDb().deleteFrom("arrangementKeys").where("churchId", "=", churchId).where("id", "in", rows.map((r) => r.id)).execute();
  }

  public async loadByArrangementId(churchId: string, arrangementId: string) {
    return getDb().selectFrom("arrangementKeys").selectAll().where("churchId", "=", churchId).where("arrangementId", "=", arrangementId).execute();
  }

  public convertToModel(_churchId: string, data: ArrangementKey) { return data; }
  public convertAllToModel(_churchId: string, data: ArrangementKey[]) { return data || []; }

  protected rowToModel(row: ArrangementKey): ArrangementKey {
    return {
      id: row.id,
      churchId: row.churchId,
      arrangementId: row.arrangementId,
      keySignature: row.keySignature,
      shortDescription: row.shortDescription
    };
  }
}
