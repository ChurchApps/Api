import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // campaigns
  await db.schema
    .createTable("campaigns")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("fundId", sql`char(11)`)
    .addColumn("name", sql`varchar(100)`)
    .addColumn("description", "text")
    .addColumn("goalAmount", sql`double`)
    .addColumn("startDate", sql`date`)
    .addColumn("endDate", sql`date`)
    .addColumn("showPublic", sql`tinyint(1)`, (col) => col.defaultTo(0))
    .addColumn("allowSelfPledge", sql`tinyint(1)`, (col) => col.defaultTo(0))
    .addColumn("removed", sql`tinyint(1)`, (col) => col.defaultTo(0))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_campaigns_church_removed").on("campaigns").columns(["churchId", "removed"]).execute();

  // pledges
  await db.schema
    .createTable("pledges")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("campaignId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("amount", sql`double`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_pledges_church_campaign").on("pledges").columns(["churchId", "campaignId"]).execute();
  await db.schema.createIndex("idx_pledges_church_person").on("pledges").columns(["churchId", "personId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("pledges").ifExists().execute();
  await db.schema.dropTable("campaigns").ifExists().execute();
}
