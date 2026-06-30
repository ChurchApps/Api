import { type Kysely, sql } from "kysely";

// Phase 0 — notification preference spine (architecture §3, §4).
//   - notifications.category: so the digest path + gate know the opt-out axis.
//   - notificationPreferences global controls (master mute, quiet hours, tz, sms, cap).
//   - notificationPreferenceOverrides: sparse per-(category x channel) opt-out table,
//     absence-means-default. No notificationCategories table — the taxonomy is a TS const.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("notifications").addColumn("category", sql`varchar(40)`).execute();

  await db.schema.alterTable("notificationPreferences")
    .addColumn("masterMute", sql`tinyint(1)`, (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("quietHoursStart", sql`time`)
    .addColumn("quietHoursEnd", sql`time`)
    .addColumn("timeZone", sql`varchar(64)`)
    .addColumn("allowSms", sql`tinyint(1)`, (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("maxPushPerDay", sql`int`)
    .execute();

  await db.schema.createTable("notificationPreferenceOverrides")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("personId", sql`char(11)`, (col) => col.notNull())
    .addColumn("categoryKey", sql`varchar(40)`, (col) => col.notNull())
    .addColumn("channel", sql`varchar(16)`, (col) => col.notNull())
    .addColumn("optedIn", sql`tinyint(1)`, (col) => col.notNull())
    .addColumn("updatedAt", sql`timestamp`, (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("ux_pref_override").on("notificationPreferenceOverrides").columns(["churchId", "personId", "categoryKey", "channel"]).unique().execute();
  await db.schema.createIndex("ix_override_channel").on("notificationPreferenceOverrides").columns(["churchId", "channel", "categoryKey"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("notificationPreferenceOverrides").ifExists().execute();
  await db.schema.alterTable("notificationPreferences")
    .dropColumn("masterMute")
    .dropColumn("quietHoursStart")
    .dropColumn("quietHoursEnd")
    .dropColumn("timeZone")
    .dropColumn("allowSms")
    .dropColumn("maxPushPerDay")
    .execute();
  await db.schema.alterTable("notifications").dropColumn("category").execute();
}
