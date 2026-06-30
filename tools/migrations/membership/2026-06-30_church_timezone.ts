import { type Kysely, sql } from "kysely";

// Phase 0 of the reminder/notification-preference subsystem.
// Adds the church's IANA timezone, the anchor for computing reminder fire times
// and the default for member quiet hours. Backfilled from the earliest campus
// (lowest id) that has a non-null timezone, falling back to America/New_York.
// Wrong for multi-campus churches spanning zones — the per-event/per-member
// override is the escape hatch (see architecture §2.4).

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("churches").addColumn("timeZone", sql`varchar(64)`).execute();

  await sql`
    UPDATE churches c
    JOIN (
      SELECT cam.churchId, cam.timezone
      FROM campuses cam
      JOIN (
        SELECT churchId, MIN(id) AS minId
        FROM campuses
        WHERE timezone IS NOT NULL AND timezone <> ''
        GROUP BY churchId
      ) firstCam ON firstCam.churchId = cam.churchId AND firstCam.minId = cam.id
    ) tz ON tz.churchId = c.id
    SET c.timeZone = tz.timezone
    WHERE c.timeZone IS NULL
  `.execute(db);

  await sql`UPDATE churches SET timeZone = 'America/New_York' WHERE timeZone IS NULL OR timeZone = ''`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("churches").dropColumn("timeZone").execute();
}
