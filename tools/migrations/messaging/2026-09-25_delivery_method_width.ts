import { type Kysely, sql } from "kysely";

// varchar(10) silently capped deliveryMethod values; sesComplaint and emailApprovalRequest need more.
export async function up(db: Kysely<any>): Promise<void> {
  await sql.raw("ALTER TABLE deliveryLogs MODIFY COLUMN deliveryMethod varchar(30)").execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql.raw("ALTER TABLE deliveryLogs MODIFY COLUMN deliveryMethod varchar(10)").execute(db);
}
