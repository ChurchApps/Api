import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { ReminderDefinition } from "../models/index.js";

@injectable()
export class ReminderDefinitionRepo {
  public async save(model: ReminderDefinition) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: ReminderDefinition): Promise<ReminderDefinition> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("reminderDefinitions").values({
      id: model.id,
      churchId: model.churchId,
      entityType: model.entityType,
      entityId: model.entityId,
      scopeId: model.scopeId,
      category: model.category ?? "event_reminders",
      offsets: model.offsets ?? "1440",
      sendLocalTime: model.sendLocalTime ?? "09:00:00",
      timeZone: model.timeZone,
      message: model.message,
      channels: model.channels ?? "push,email,in_app",
      recipientMode: model.recipientMode ?? "auto",
      enabled: (model.enabled ?? true) as any,
      dateCreated: sql`NOW()` as any,
      dateModified: sql`NOW()` as any
    }).execute();
    return model;
  }

  private async update(model: ReminderDefinition): Promise<ReminderDefinition> {
    await getDb().updateTable("reminderDefinitions").set({
      category: model.category,
      offsets: model.offsets,
      sendLocalTime: model.sendLocalTime,
      timeZone: model.timeZone,
      message: model.message,
      channels: model.channels,
      recipientMode: model.recipientMode,
      enabled: model.enabled as any,
      dateModified: sql`NOW()` as any
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("reminderDefinitions").selectAll()
      .where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadForEntity(churchId: string, entityType: string, entityId: string) {
    return getDb().selectFrom("reminderDefinitions").selectAll()
      .where("churchId", "=", churchId).where("entityType", "=", entityType).where("entityId", "=", entityId)
      .execute();
  }

  // Scoped definitions (entityId null) for an inheritance scope — the ux_reminder_scope index.
  public async loadForScope(churchId: string, entityType: string, scopeId: string) {
    return getDb().selectFrom("reminderDefinitions").selectAll()
      .where("churchId", "=", churchId).where("entityType", "=", entityType).where("scopeId", "=", scopeId)
      .execute();
  }

  // Global across churches — the expander cron iterates every enabled definition.
  public async loadAllEnabled() {
    return getDb().selectFrom("reminderDefinitions").selectAll().where("enabled", "=", true as any).execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("reminderDefinitions").where("id", "=", id).where("churchId", "=", churchId).execute();
  }
}
