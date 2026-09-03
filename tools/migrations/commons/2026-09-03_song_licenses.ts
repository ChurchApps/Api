import { type Kysely, sql } from "kysely";

// Six catalog licenses (PD, WC, CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-NC-SA): the longest code no longer
// fits assets.license varchar(10). Songs also record the exact license version and URL the writer
// applied (CC BY 3.0 vs 4.0, CC0 dedications) so the site can print a correct notice.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`alter table assets modify column license varchar(16) null`.execute(db);
  await db.schema.alterTable("songs").addColumn("licenseVersion", sql`varchar(10)`).execute();
  await db.schema.alterTable("songs").addColumn("licenseUrl", sql`varchar(255)`).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("songs").dropColumn("licenseUrl").execute();
  await db.schema.alterTable("songs").dropColumn("licenseVersion").execute();
  await sql`alter table assets modify column license varchar(10) null`.execute(db);
}
