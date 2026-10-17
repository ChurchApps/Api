import { type Kysely, sql } from "kysely";

// Who may view / post an event's staff notes: NULL = staff only, "leaders", or "members" of the event's group.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE events ADD COLUMN notesViewRole VARCHAR(20) NULL, ADD COLUMN notesPostRole VARCHAR(20) NULL`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE events DROP COLUMN notesViewRole, DROP COLUMN notesPostRole`.execute(db);
}
