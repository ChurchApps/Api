import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql.raw("ALTER TABLE devices DROP INDEX idx_devices_fcmToken").execute(db).catch(() => {});
  await sql.raw("ALTER TABLE devices MODIFY COLUMN fcmToken text").execute(db);
  await sql.raw("ALTER TABLE deliveryLogs MODIFY COLUMN deliveryAddress text").execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql.raw("ALTER TABLE devices MODIFY COLUMN fcmToken varchar(255)").execute(db);
  await sql.raw("ALTER TABLE deliveryLogs MODIFY COLUMN deliveryAddress varchar(255)").execute(db);
  await db.schema.createIndex("idx_devices_fcmToken").on("devices").column("fcmToken").execute().catch(() => {});
}
