import { type Kysely, sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { createKysely } from "../../kysely-config.js";

const daysCsvToMinutesCsv = (csv: string | null | undefined): string => {
  if (csv === undefined || csv === null) return "";
  const mins = csv.split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .map((d) => d * 1440);
  return [...new Set(mins)].sort((a, b) => a - b).join(",");
};

export async function up(db: Kysely<any>): Promise<void> {
  const planTypes = await db.selectFrom("planTypes")
    .select(["id", "churchId", "reminderOffsets", "reminderMessage"])
    .where("reminderOffsets", "is not", null)
    .where("reminderOffsets", "<>", "")
    .execute();

  const messaging = createKysely("messaging");
  try {
    for (const pt of planTypes as any[]) {
      const offsets = daysCsvToMinutesCsv(pt.reminderOffsets);
      if (!offsets) continue; // empty = reminders off

      const existing = await messaging.selectFrom("reminderDefinitions").select("id")
        .where("churchId", "=", pt.churchId)
        .where("entityType", "=", "plan")
        .where("scopeId", "=", pt.id)
        .executeTakeFirst();
      if (existing) continue; // ux_reminder_scope — already migrated

      await messaging.insertInto("reminderDefinitions").values({
        id: UniqueIdHelper.shortId(),
        churchId: pt.churchId,
        entityType: "plan",
        entityId: null,
        scopeId: pt.id,
        category: "serving_schedule",
        offsets,
        sendLocalTime: "09:00:00",
        timeZone: null,
        message: pt.reminderMessage ?? null,
        channels: "push,email",
        recipientMode: "assignments",
        enabled: 1,
        dateCreated: sql`NOW()`,
        dateModified: sql`NOW()`
      }).execute();
    }
  } finally {
    await messaging.destroy();
  }

  await db.schema.alterTable("planTypes").dropColumn("reminderOffsets").execute();
  await db.schema.alterTable("planTypes").dropColumn("reminderMessage").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Schema reversal only — the migrated reminderDefinitions rows are left in place
  // (they are the live source of truth) and the per-planType data is not restored.
  await db.schema.alterTable("planTypes").addColumn("reminderOffsets", sql`varchar(255)`, (col) => col.defaultTo("2")).execute();
  await db.schema.alterTable("planTypes").addColumn("reminderMessage", sql`text`).execute();
}
