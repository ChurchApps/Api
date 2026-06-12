import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("labelTemplates")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .addColumn("labelType", sql`varchar(20)`)
    .addColumn("width", sql`decimal(5,2)`)
    .addColumn("height", sql`decimal(5,2)`)
    .addColumn("isDefault", sql`tinyint(1)`)
    .addColumn("content", sql`mediumtext`)
    .addColumn("createdDate", sql`datetime`)
    .addColumn("modifiedDate", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_labelTemplates_churchId").on("labelTemplates").column("churchId").execute();

  await db.schema
    .alterTable("visits")
    .addColumn("securityCode", sql`varchar(10)`)
    .addColumn("checkoutTime", sql`datetime`)
    .addColumn("checkedOutBy", sql`varchar(255)`)
    .addColumn("checkedOutById", sql`char(11)`)
    .execute();

  await db.schema.createIndex("idx_visits_church_date_code").on("visits").columns(["churchId", "visitDate", "securityCode"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_visits_church_date_code").on("visits").execute();
  await db.schema.alterTable("visits").dropColumn("securityCode").dropColumn("checkoutTime").dropColumn("checkedOutBy").dropColumn("checkedOutById").execute();
  await db.schema.dropTable("labelTemplates").ifExists().execute();
}
