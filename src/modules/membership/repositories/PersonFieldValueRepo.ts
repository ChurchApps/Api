import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { PersonFieldValue } from "../models/index.js";

@injectable()
export class PersonFieldValueRepo {
  public async save(model: PersonFieldValue) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: PersonFieldValue): Promise<PersonFieldValue> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("personFieldValues").values({
      id: model.id,
      churchId: model.churchId,
      personId: model.personId,
      fieldId: model.fieldId,
      value: model.value
    }).execute();
    return model;
  }

  private async update(model: PersonFieldValue): Promise<PersonFieldValue> {
    await getDb().updateTable("personFieldValues").set({
      personId: model.personId,
      fieldId: model.fieldId,
      value: model.value
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("personFieldValues").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteForField(churchId: string, fieldId: string) {
    await getDb().deleteFrom("personFieldValues").where("churchId", "=", churchId).where("fieldId", "=", fieldId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("personFieldValues").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadForPerson(churchId: string, personId: string) {
    return getDb().selectFrom("personFieldValues").selectAll().where("churchId", "=", churchId).where("personId", "=", personId).execute();
  }

  public async loadForField(churchId: string, fieldId: string) {
    return getDb().selectFrom("personFieldValues").selectAll().where("churchId", "=", churchId).where("fieldId", "=", fieldId).execute();
  }

  public async loadForPersonField(churchId: string, personId: string, fieldId: string) {
    return (await getDb().selectFrom("personFieldValues").selectAll()
      .where("churchId", "=", churchId).where("personId", "=", personId).where("fieldId", "=", fieldId)
      .executeTakeFirst()) ?? null;
  }

  // Upsert by (churchId, personId, fieldId); a blank value clears the row so the UI can unset a field.
  public async upsert(churchId: string, personId: string, fieldId: string, value: string): Promise<PersonFieldValue | null> {
    const existing = await this.loadForPersonField(churchId, personId, fieldId);
    const blank = value === undefined || value === null || value === "";
    if (blank) {
      if (existing) await this.delete(churchId, (existing as any).id);
      return null;
    }
    return this.save({ id: (existing as any)?.id, churchId, personId, fieldId, value });
  }

  protected rowToModel(row: any): PersonFieldValue {
    return {
      id: row.id,
      churchId: row.churchId,
      personId: row.personId,
      fieldId: row.fieldId,
      value: row.value
    };
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return (data || []).map((row) => this.rowToModel(row));
  }
}
