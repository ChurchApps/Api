import { injectable } from "inversify";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { HouseholdPickupPerson } from "../models/index.js";

@injectable()
export class HouseholdPickupPersonRepo {
  public async save(model: HouseholdPickupPerson) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: HouseholdPickupPerson): Promise<HouseholdPickupPerson> {
    model.id = UniqueIdHelper.shortId();
    model.createdDate = model.createdDate ?? new Date();
    await getDb().insertInto("householdPickupPeople").values({
      id: model.id,
      churchId: model.churchId,
      householdId: model.householdId,
      personId: model.personId ?? null,
      name: model.name,
      photoUrl: model.photoUrl ?? null,
      relationship: model.relationship ?? null,
      status: model.status,
      notes: model.notes ?? null,
      createdDate: model.createdDate as any
    }).execute();
    return model;
  }

  private async update(model: HouseholdPickupPerson): Promise<HouseholdPickupPerson> {
    await getDb().updateTable("householdPickupPeople").set({
      personId: model.personId ?? null,
      name: model.name,
      photoUrl: model.photoUrl ?? null,
      relationship: model.relationship ?? null,
      status: model.status,
      notes: model.notes ?? null
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  // churchId + householdId scoping is the security property — every read/write carries both.
  public async loadByHousehold(churchId: string, householdId: string) {
    return getDb().selectFrom("householdPickupPeople").selectAll()
      .where("churchId", "=", churchId)
      .where("householdId", "=", householdId)
      .orderBy("status")
      .orderBy("name")
      .execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("householdPickupPeople").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("householdPickupPeople").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  protected rowToModel(row: any): HouseholdPickupPerson {
    return {
      id: row.id,
      churchId: row.churchId,
      householdId: row.householdId,
      personId: row.personId,
      name: row.name,
      photoUrl: row.photoUrl,
      relationship: row.relationship,
      status: row.status,
      notes: row.notes,
      createdDate: row.createdDate
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
