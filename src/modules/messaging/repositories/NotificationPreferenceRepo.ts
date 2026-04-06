import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { NotificationPreference } from "../models/index.js";

@injectable()
export class NotificationPreferenceRepo {
  public async save(model: NotificationPreference) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: NotificationPreference): Promise<NotificationPreference> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("notificationPreferences").values({
      id: model.id,
      churchId: model.churchId,
      personId: model.personId,
      allowPush: model.allowPush,
      emailFrequency: model.emailFrequency
    }).execute();
    return model;
  }

  private async update(model: NotificationPreference): Promise<NotificationPreference> {
    await getDb().updateTable("notificationPreferences").set({
      personId: model.personId,
      allowPush: model.allowPush,
      emailFrequency: model.emailFrequency
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async loadById(churchId: string, id: string) {
    return (await getDb().selectFrom("notificationPreferences").selectAll()
      .where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByPersonId(churchId: string, personId: string): Promise<NotificationPreference | undefined> {
    return (await getDb().selectFrom("notificationPreferences").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .executeTakeFirst()) ?? null;
  }

  public async loadByChurchId(churchId: string) {
    return getDb().selectFrom("notificationPreferences").selectAll()
      .where("churchId", "=", churchId)
      .execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("notificationPreferences").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async loadByPersonIds(personIds: string[]) {
    if (!personIds || personIds.length === 0) return [];
    return getDb().selectFrom("notificationPreferences").selectAll()
      .where("personId", "in", personIds)
      .execute();
  }

  protected rowToModel(data: any): NotificationPreference {
    return {
      id: data.id,
      churchId: data.churchId,
      personId: data.personId,
      allowPush: data.allowPush,
      emailFrequency: data.emailFrequency
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
