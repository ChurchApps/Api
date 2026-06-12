import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Resource } from "../models/index.js";
import { injectable } from "inversify";

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
      approvalGroupId: model.approvalGroupId
    } as any).execute();
    return model;
  }

  private async update(model: Resource): Promise<Resource> {
    await getDb().updateTable("resources").set({
      name: model.name,
      description: model.description,
      quantity: model.quantity,
      approvalGroupId: model.approvalGroupId
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("resources").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Resource | undefined> {
    return (await getDb().selectFrom("resources").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Resource[]> {
    return getDb().selectFrom("resources").selectAll().where("churchId", "=", churchId).orderBy("name").execute() as any;
  }

  public async loadByIds(churchId: string, ids: string[]): Promise<Resource[]> {
    if (ids.length === 0) return [];
    return getDb().selectFrom("resources").selectAll().where("churchId", "=", churchId).where("id", "in", ids).execute() as any;
  }

  public convertToModel(_churchId: string, data: any) { return data as Resource; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Resource[]; }
}
