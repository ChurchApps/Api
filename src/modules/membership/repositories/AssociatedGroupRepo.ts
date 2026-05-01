import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { AssociatedGroup } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class AssociatedGroupRepo {
  public async save(model: AssociatedGroup) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: AssociatedGroup): Promise<AssociatedGroup> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("associatedGroups").values({
      id: model.id,
      churchId: model.churchId,
      contentType: model.contentType,
      contentId: model.contentId,
      groupId: model.groupId,
      settings: model.settings
    }).execute();
    return model;
  }

  private async update(model: AssociatedGroup): Promise<AssociatedGroup> {
    await getDb().updateTable("associatedGroups").set({
      contentType: model.contentType,
      contentId: model.contentId,
      groupId: model.groupId,
      settings: model.settings
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("associatedGroups").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("associatedGroups").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByContent(churchId: string, contentType: string, contentId: string) {
    return getDb().selectFrom("associatedGroups").selectAll()
      .where("churchId", "=", churchId)
      .where("contentType", "=", contentType)
      .where("contentId", "=", contentId)
      .execute();
  }

  public async loadByGroup(churchId: string, groupId: string, contentType?: string) {
    let q = getDb().selectFrom("associatedGroups").selectAll()
      .where("churchId", "=", churchId)
      .where("groupId", "=", groupId);
    if (contentType) q = q.where("contentType", "=", contentType);
    return q.execute();
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return (data || []).map(row => this.rowToModel(row));
  }

  protected rowToModel(row: any): AssociatedGroup {
    return {
      id: row.id,
      churchId: row.churchId,
      contentType: row.contentType,
      contentId: row.contentId,
      groupId: row.groupId,
      settings: row.settings
    };
  }
}
