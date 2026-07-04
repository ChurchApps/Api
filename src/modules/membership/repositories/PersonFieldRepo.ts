import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { PersonField } from "../models/index.js";

@injectable()
export class PersonFieldRepo {
  public async save(model: PersonField) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: PersonField): Promise<PersonField> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("personFields").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name,
      fieldType: model.fieldType,
      sort: model.sort,
      choices: model.choices ?? null
    }).execute();
    return model;
  }

  private async update(model: PersonField): Promise<PersonField> {
    await getDb().updateTable("personFields").set({
      name: model.name,
      fieldType: model.fieldType,
      sort: model.sort,
      choices: model.choices ?? null
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("personFields").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("personFields").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("personFields").selectAll().where("churchId", "=", churchId).orderBy("sort").orderBy("name").execute();
  }

  public saveAll(models: PersonField[]) {
    const promises: Promise<PersonField>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  // choices is an opaque JSON string end-to-end; clients parse it.
  protected rowToModel(row: any): PersonField {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name,
      fieldType: row.fieldType,
      sort: row.sort,
      choices: row.choices ?? undefined
    };
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return (data || []).map((row) => this.rowToModel(row));
  }
}
