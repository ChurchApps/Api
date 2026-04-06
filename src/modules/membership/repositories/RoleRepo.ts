import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Role } from "../models/index.js";

@injectable()
export class RoleRepo {
  public async save(model: Role) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Role): Promise<Role> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("roles").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name
    }).execute();
    return model;
  }

  private async update(model: Role): Promise<Role> {
    await getDb().updateTable("roles").set({ name: model.name }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("roles").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("roles").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadById(churchId: string, id: string): Promise<Role> {
    return (await getDb().selectFrom("roles").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByIds(ids: string[]) {
    if (!ids.length) return [];
    return getDb().selectFrom("roles").selectAll().where("id", "in", ids).execute();
  }

  public async loadAll() {
    return getDb().selectFrom("roles").selectAll().execute();
  }

  public async loadByChurchId(id: string) {
    return getDb().selectFrom("roles").selectAll().where("churchId", "=", id).execute();
  }

  public saveAll(models: Role[]) {
    const promises: Promise<Role>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: Role): Promise<Role> {
    return this.create(model);
  }

  protected rowToModel(row: any): Role {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name
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
