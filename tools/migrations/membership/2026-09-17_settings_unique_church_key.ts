import { type Kysely, sql } from "kysely";

// Issue #1092: duplicate settings rows for the same church + keyName made the
// public directoryVisibility gate last-write-win (Rich Hill stayed on "Members"
// while admin showed "Regular Attendees"). Keep the lowest id, then enforce uniqueness.

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    DELETE s1 FROM settings s1
    INNER JOIN settings s2
      ON s1.churchId = s2.churchId
     AND s1.keyName = s2.keyName
     AND s1.id > s2.id
  `.execute(db);

  await sql`
    UPDATE settings
       SET public = 1
     WHERE keyName IN ('directoryVisibility', 'directoryApprovalGroupId')
       AND (public IS NULL OR public = 0)
  `.execute(db);

  await db.schema.dropIndex("idx_settings_churchId_keyName").on("settings").execute().catch((e: { errno?: number }) => { if (e?.errno !== 1091) throw e; });
  await db.schema
    .createIndex("idx_settings_churchId_keyName")
    .on("settings")
    .columns(["churchId", "keyName"])
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_settings_churchId_keyName").on("settings").execute().catch((e: { errno?: number }) => { if (e?.errno !== 1091) throw e; });
}
