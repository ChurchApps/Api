import { type Kysely, sql } from "kysely";

// "Expand to Actions" copies provider action text straight into plan items. Lessons.church
// labels reach 103 chars and scripts run past 1000, which strict-mode MySQL rejects outright.

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE planItems MODIFY COLUMN label VARCHAR(255)`.execute(db);
  await sql`ALTER TABLE planItems MODIFY COLUMN description TEXT`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE planItems MODIFY COLUMN label VARCHAR(100)`.execute(db);
  await sql`ALTER TABLE planItems MODIFY COLUMN description VARCHAR(1000)`.execute(db);
}
