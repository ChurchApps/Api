import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { NotificationPreferenceOverride } from "../models/index.js";

@injectable()
export class NotificationPreferenceOverrideRepo {
  // Upsert on the natural key (churchId, personId, categoryKey, channel).
  public async save(model: NotificationPreferenceOverride) {
    const existing = await getDb().selectFrom("notificationPreferenceOverrides").selectAll()
      .where("churchId", "=", model.churchId)
      .where("personId", "=", model.personId)
      .where("categoryKey", "=", model.categoryKey)
      .where("channel", "=", model.channel)
      .executeTakeFirst();
    if (existing) {
      await getDb().updateTable("notificationPreferenceOverrides")
        .set({ optedIn: model.optedIn })
        .where("id", "=", (existing as any).id).execute();
      model.id = (existing as any).id;
      return model;
    }
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("notificationPreferenceOverrides").values({
      id: model.id,
      churchId: model.churchId,
      personId: model.personId,
      categoryKey: model.categoryKey,
      channel: model.channel,
      optedIn: model.optedIn
    }).execute();
    return model;
  }

  public async loadForPerson(churchId: string, personId: string) {
    return getDb().selectFrom("notificationPreferenceOverrides").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("notificationPreferenceOverrides")
      .where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  protected rowToModel(data: any): NotificationPreferenceOverride {
    return {
      id: data.id,
      churchId: data.churchId,
      personId: data.personId,
      categoryKey: data.categoryKey,
      channel: data.channel,
      optedIn: !!data.optedIn,
      updatedAt: data.updatedAt
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
