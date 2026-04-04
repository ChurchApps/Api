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
    } as any).execute();
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
    return getDb().selectFrom("arrangementKeys").selectAll().where("churchId", "=", churchId).execute() as any;
  }

  public async deleteForArrangement(churchId: string, arrangementId: string) {
    await getDb().deleteFrom("arrangementKeys").where("churchId", "=", churchId).where("arrangementId", "=", arrangementId).execute();
  }

  public async loadByArrangementId(churchId: string, arrangementId: string) {
    return getDb().selectFrom("arrangementKeys").selectAll().where("churchId", "=", churchId).where("arrangementId", "=", arrangementId).execute() as any;
  }

  public convertToModel(_churchId: string, data: any) { return data as ArrangementKey; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as ArrangementKey[]; }

  protected rowToModel(row: any): ArrangementKey {
    return {
      id: row.id,
      churchId: row.churchId,
      arrangementId: row.arrangementId,
      keySignature: row.keySignature,
      shortDescription: row.shortDescription
    };
  }
}
