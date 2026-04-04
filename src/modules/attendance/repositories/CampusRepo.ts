import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Campus } from "../models/index.js";

@injectable()
export class CampusRepo {
  public async save(model: Campus) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Campus): Promise<Campus> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("campuses").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name,
      address1: model.address1,
      address2: model.address2,
      city: model.city,
      state: model.state,
      zip: model.zip,
      removed: false
    }).execute();
    return model;
  }

  private async update(model: Campus): Promise<Campus> {
    await getDb().updateTable("campuses").set({
      name: model.name,
      address1: model.address1,
      address2: model.address2,
      city: model.city,
      state: model.state,
      zip: model.zip
    }).where("id", "=", model.id)
      .where("churchId", "=", model.churchId)
      .execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().updateTable("campuses").set({ removed: true }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("campuses").selectAll().where("id", "=", id).where("churchId", "=", churchId).where("removed", "=", false).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("campuses").selectAll().where("churchId", "=", churchId).where("removed", "=", false).orderBy("name").execute();
  }

  protected rowToModel(data: any): Campus {
    const result: Campus = {
      id: data.id,
      name: data.name,
      address1: data.address1,
      address2: data.address2,
      city: data.city,
      state: data.state,
      zip: data.zip,
      importKey: data.importKey
    };
    return result;
  }
}
