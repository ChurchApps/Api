import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Site } from "../models/index.js";

@injectable()
export class SiteRepo {
  public async save(model: Site) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Site): Promise<Site> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("sites").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name,
      subDomain: model.subDomain
    }).execute();
    return model;
  }

  private async update(model: Site): Promise<Site> {
    await getDb().updateTable("sites").set({
      name: model.name,
      subDomain: model.subDomain
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("sites").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("sites").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("sites").selectAll().where("churchId", "=", churchId).orderBy("name").execute();
  }

  // Subdomains are a global namespace — no churchId filter.
  public async loadBySubDomain(subDomain: string) {
    return (await getDb().selectFrom("sites").selectAll().where("subDomain", "=", subDomain).executeTakeFirst()) ?? null;
  }

  protected rowToModel(row: any): Site {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name,
      subDomain: row.subDomain
    };
  }

  public convertToModel(_churchId: string, data: any) {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    if (!Array.isArray(data)) return [];
    return data.map((d) => this.rowToModel(d));
  }
}
