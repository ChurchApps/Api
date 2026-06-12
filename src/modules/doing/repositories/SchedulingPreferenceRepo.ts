import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { SchedulingPreference } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class SchedulingPreferenceRepo {
  public async save(model: SchedulingPreference) {
    // One preference row per person; ignore stale ids and upsert on personId.
    const existing = await this.loadForPerson(model.churchId, model.personId);
    if (existing) model.id = existing.id;
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: SchedulingPreference): Promise<SchedulingPreference> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("schedulingPreferences").values({
      id: model.id,
      churchId: model.churchId,
      personId: model.personId,
      maxPerMonth: model.maxPerMonth,
      preferredTimes: model.preferredTimes,
      householdScheduling: model.householdScheduling
    }).execute();
    return model;
  }

  private async update(model: SchedulingPreference): Promise<SchedulingPreference> {
    await getDb().updateTable("schedulingPreferences").set({
      personId: model.personId,
      maxPerMonth: model.maxPerMonth,
      preferredTimes: model.preferredTimes,
      householdScheduling: model.householdScheduling
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("schedulingPreferences").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("schedulingPreferences").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("schedulingPreferences").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadForPerson(churchId: string, personId: string) {
    return (await getDb().selectFrom("schedulingPreferences").selectAll().where("churchId", "=", churchId).where("personId", "=", personId).executeTakeFirst()) ?? null;
  }

  public async loadByPersonIds(churchId: string, personIds: string[]) {
    if (personIds.length === 0) return [];
    return getDb().selectFrom("schedulingPreferences").selectAll().where("churchId", "=", churchId).where("personId", "in", personIds).execute();
  }
}
