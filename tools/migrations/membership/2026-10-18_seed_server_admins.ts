import { type Kysely } from "kysely";

// Mirrors tools/dbScripts/membership/populateData.sql so a migration-only install (Docker, Railway) gets a Server Admins role.
const PERMISSIONS: [string, string][] = [
  ["Server", "Admin"], ["Roles", "Edit"], ["Roles", "View"], ["RoleMembers", "Edit"], ["RoleMembers", "View"],
  ["RolePermissions", "Edit"], ["RolePermissions", "View"], ["Users", "Edit"], ["Users", "View"]
];

export async function up(db: Kysely<any>): Promise<void> {
  let role = await db.selectFrom("roles").select("id").where("churchId", "=", "0").where("name", "=", "Server Admins").executeTakeFirst();
  if (!role) {
    const taken = await db.selectFrom("roles").select("id").where("id", "=", "r1").executeTakeFirst();
    role = { id: taken ? "r" + Date.now().toString(36).slice(-10) : "r1" };
    await db.insertInto("roles").values({ id: role.id, churchId: "0", name: "Server Admins" }).execute();
  }
  for (const [i, [contentType, action]] of PERMISSIONS.entries()) {
    const existing = await db.selectFrom("rolePermissions").select("id")
      .where("roleId", "=", role.id).where("apiName", "=", "MembershipApi").where("contentType", "=", contentType).where("action", "=", action)
      .executeTakeFirst();
    if (existing) continue;
    const wanted = "rp" + (i + 1);
    const taken = await db.selectFrom("rolePermissions").select("id").where("id", "=", wanted).executeTakeFirst();
    const id = taken ? "rp" + i + Date.now().toString(36).slice(-8) : wanted;
    await db.insertInto("rolePermissions").values({ id, churchId: "0", roleId: role.id, apiName: "MembershipApi", contentType, action }).execute();
  }
}

export async function down(): Promise<void> {
  // Keep the role: removing it would lock every server admin out.
}
