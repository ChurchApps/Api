import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Resource } from "../models/index.js";
import { injectable } from "inversify";
import type { TinyIntActive } from "./types.js";

@injectable()
export class ResourceRepo {
  public async save(model: Resource) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Resource): Promise<Resource> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("resources").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name,
      description: model.description,
      quantity: model.quantity,
      approvalGroupId: model.approvalGroupId,
      active: model.active ?? true,
      categoryName: model.categoryName?.trim() || null
    }).execute();
    return model;
  }

  private async update(model: Resource): Promise<Resource> {
    await getDb().updateTable("resources").set({
      name: model.name,
      description: model.description,
      quantity: model.quantity ?? null,
      approvalGroupId: model.approvalGroupId ?? null,
      active: model.active ?? true,
      categoryName: model.categoryName?.trim() || null
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("resources").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Resource | undefined> {
    const row = await getDb().selectFrom("resources").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst();
    return row ? this.convertToModel(churchId, row) : null;
  }

  public async loadAll(churchId: string): Promise<Resource[]> {
    return this.convertAllToModel(churchId, await getDb().selectFrom("resources").selectAll().where("churchId", "=", churchId).orderBy("name").execute());
  }

  public async loadByIds(churchId: string, ids: string[]): Promise<Resource[]> {
    if (ids.length === 0) return [];
    return this.convertAllToModel(churchId, await getDb().selectFrom("resources").selectAll().where("churchId", "=", churchId).where("id", "in", ids).execute());
  }

  // MySQL returns TINYINT(1) as 0/1.
  public convertToModel(_churchId: string, data: TinyIntActive<Resource>) {
    if (!data) return data as Resource;
    return { ...data, active: data.active === undefined ? true : !!data.active } as Resource;
  }

  public convertAllToModel(churchId: string, data: TinyIntActive<Resource>[]) { return (data || []).map((d) => this.convertToModel(churchId, d)); }
}
