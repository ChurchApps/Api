import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { NotificationEntityMute } from "../models/index.js";

@injectable()
export class NotificationEntityMuteRepo {
  // Upsert on the natural key (churchId, personId, entityType, entityId).
  public async save(model: NotificationEntityMute) {
    const existing = await getDb().selectFrom("notificationEntityMutes").select(["id"])
      .where("churchId", "=", model.churchId)
      .where("personId", "=", model.personId)
      .where("entityType", "=", model.entityType)
      .where("entityId", "=", model.entityId)
      .executeTakeFirst();
    if (existing) {
      await getDb().updateTable("notificationEntityMutes").set({ level: model.level })
        .where("id", "=", (existing as any).id).execute();
      model.id = (existing as any).id;
      return model;
    }
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("notificationEntityMutes").values({
      id: model.id,
      churchId: model.churchId,
      personId: model.personId,
      entityType: model.entityType,
      entityId: model.entityId,
      level: model.level ?? "all"
    }).execute();
    return model;
  }

  public async loadForPerson(churchId: string, personId: string) {
    return getDb().selectFrom("notificationEntityMutes").selectAll()
      .where("churchId", "=", churchId).where("personId", "=", personId).execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("notificationEntityMutes").where("id", "=", id).where("churchId", "=", churchId).execute();
  }
}
