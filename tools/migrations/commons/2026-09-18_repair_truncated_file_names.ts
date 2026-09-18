import { type Kysely } from "kysely";
import { completedPackageName } from "../../../src/modules/commons/helpers/PackageLayout.js";

// assetFiles.name was varchar(100) until 2026-09-08. Silent MySQL truncation left keys like
// "attributi" / "duration." / "sl" in fileUrls and 404 download URLs. Column is 255 now;
// rewrite the leftover prefixes to the conventional package file they were cut from.
export async function up(db: Kysely<any>): Promise<void> {
  const rows = await db.selectFrom("assetFiles").select(["id", "assetId", "name", "submissionId"]).execute();
  const have = new Set(rows.map((r) => `${r.assetId}\n${r.submissionId ?? ""}\n${r.name}`));
  for (const r of rows) {
    const to = completedPackageName(String(r.name || ""));
    if (!to || to === r.name) continue;
    const key = `${r.assetId}\n${r.submissionId ?? ""}\n${to}`;
    if (have.has(key)) {
      await db.deleteFrom("assetFiles").where("id", "=", r.id).execute();
      continue;
    }
    await db.updateTable("assetFiles").set({ name: to }).where("id", "=", r.id).execute();
    have.delete(`${r.assetId}\n${r.submissionId ?? ""}\n${r.name}`);
    have.add(key);
  }
}

export async function down(): Promise<void> {}
