import { type Kysely, sql } from "kysely";

// Issue #1426: anyone in any role picks up the Everyone permissions, so this grant let every
// role holder run the kiosk and use its person reads. Check-in now has to be given to a role.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    DELETE FROM rolePermissions
     WHERE roleId IS NULL
       AND apiName = 'AttendanceApi'
       AND contentType = 'Attendance'
       AND action = 'Checkin'
  `.execute(db);
}

// The deleted rows can't be told apart from churches that had already unticked the grant.
export async function down(_db: Kysely<any>): Promise<void> {}
