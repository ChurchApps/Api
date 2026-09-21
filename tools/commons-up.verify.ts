import { sql } from "kysely";
import { createKysely, ensureEnvironment } from "./kysely-config.js";

// Drift harness for commons-up: dirty a database the way a month of production does, then assert
// what the tool must fix and what it must not touch. `--before` dirties, `--after` checks.
// Run: tsx tools/commons-up.verify.ts --before && tsx tools/commons-up.ts && tsx tools/commons-up.verify.ts --after
const FAKE_ASSET = "zzuserupld1";
const FAKE_SUB = "zzusersub01";

async function before(db: any) {
  const victim = await db.selectFrom("assets").select(["id", "name"]).orderBy("id").limit(1).executeTakeFirstOrThrow();
  const gone = await db.selectFrom("assets").select("id").orderBy("id", "desc").limit(1).executeTakeFirstOrThrow();
  const author = await db.selectFrom("authors").select("id").orderBy("id").limit(1).executeTakeFirstOrThrow();

  // a month of real use: counters climbed, a writer edited their profile
  await db.updateTable("assets").set({ downloadCount: 4242, saveCount: 77 }).where("id", "=", victim.id).execute();
  await db.updateTable("authors").set({ bio: "EDITED BY THE WRITER" }).where("id", "=", author.id).execute();
  // drift the content columns away from the catalog
  await db.updateTable("assets").set({ name: "WRONG TITLE", tags: "wrong" }).where("id", "=", victim.id).execute();
  await db.updateTable("songs").set({ ccli: "9999999", bpm: 1 }).where("assetId", "=", victim.id).execute();
  // a whole package missing, as if it never seeded
  await db.deleteFrom("assetFiles").where("assetId", "=", gone.id).execute();
  await db.deleteFrom("songs").where("assetId", "=", gone.id).execute();
  await db.deleteFrom("submissions").where("assetId", "=", gone.id).execute();
  await db.deleteFrom("assets").where("id", "=", gone.id).execute();
  // something a user uploaded that the content repo has never heard of
  await db.insertInto("assets").values({ id: FAKE_ASSET, assetType: "song", name: "A User Upload", language: "en", license: "WC", status: "approved", downloadCount: 5, saveCount: 1 }).execute();
  await db.insertInto("submissions").values({ id: FAKE_SUB, assetId: FAKE_ASSET, submittedBy: "user1", status: "approved", payload: "{}", note: "User" }).execute();
  await db.insertInto("assetFiles").values({ id: "zzuserfil01", assetId: FAKE_ASSET, submissionId: FAKE_SUB, name: "songs/en/x/user.pdf", action: "add" }).execute();
  // a user-uploaded file hanging off a catalog asset must also survive
  await db.insertInto("assetFiles").values({ id: "zzuserfil02", assetId: victim.id, submissionId: FAKE_SUB, name: "songs/en/x/extra.pdf", action: "add" }).execute();

  console.log(JSON.stringify({ victim: victim.id, gone: gone.id, author: author.id }));
}

async function after(db: any, state: { victim: string; gone: string; author: string }) {
  const fail: string[] = [];
  const ok: string[] = [];
  const check = (cond: boolean, msg: string) => (cond ? ok : fail).push(msg);

  const v = await db.selectFrom("assets").selectAll().where("id", "=", state.victim).executeTakeFirst();
  const vs = await db.selectFrom("songs").selectAll().where("assetId", "=", state.victim).executeTakeFirst();
  check(v?.name !== "WRONG TITLE", "content column repaired: assets.name");
  check(v?.tags !== "wrong", "content column repaired: assets.tags");
  check(vs?.ccli !== "9999999", "content column repaired: songs.ccli");
  check(vs?.bpm !== 1, "content column repaired: songs.bpm");
  check(Number(v?.downloadCount) === 4242, "user data preserved: downloadCount");
  check(Number(v?.saveCount) === 77, "user data preserved: saveCount");

  const a = await db.selectFrom("authors").select(["bio", "name"]).where("id", "=", state.author).executeTakeFirst();
  check(a?.bio === "EDITED BY THE WRITER", "profile edit preserved: authors.bio");
  const sameName = await db.selectFrom("authors").select(sql<number>`count(*)`.as("n")).where("name", "=", a?.name).executeTakeFirst();
  check((sameName?.n ?? 0) === 1, "profile edit did not fork a duplicate author row");
  const stillLinked = await db.selectFrom("songs").select(sql<number>`count(*)`.as("n")).where("authorId", "=", state.author).executeTakeFirst();
  check((stillLinked?.n ?? 0) > 0, "songs still point at the edited author row");

  const restored = await db.selectFrom("assets").select("id").where("id", "=", state.gone).executeTakeFirst();
  const restoredSong = await db.selectFrom("songs").select("assetId").where("assetId", "=", state.gone).executeTakeFirst();
  const restoredFiles = await db.selectFrom("assetFiles").select(sql<number>`count(*)`.as("n")).where("assetId", "=", state.gone).executeTakeFirst();
  check(!!restored, "missing package restored: assets row");
  check(!!restoredSong, "missing package restored: songs row");
  check((restoredFiles?.n ?? 0) > 0, "missing package restored: assetFiles");

  const fake = await db.selectFrom("assets").selectAll().where("id", "=", FAKE_ASSET).executeTakeFirst();
  const fakeFile = await db.selectFrom("assetFiles").select("id").where("id", "=", "zzuserfil01").executeTakeFirst();
  const userFileOnCatalogAsset = await db.selectFrom("assetFiles").select("id").where("id", "=", "zzuserfil02").executeTakeFirst();
  check(!!fake && Number(fake.downloadCount) === 5, "user upload untouched: assets row");
  check(!!fakeFile, "user upload untouched: its assetFile");
  check(!!userFileOnCatalogAsset, "user file on a catalog asset survived the file replace");

  ok.forEach((m) => console.log(`  PASS  ${m}`));
  fail.forEach((m) => console.log(`  FAIL  ${m}`));
  console.log(`\n${ok.length} passed, ${fail.length} failed`);
  if (fail.length) process.exit(1);
}

async function main() {
  await ensureEnvironment();
  const db = createKysely("commons");
  try {
    if (process.argv.includes("--before")) await before(db);
    else await after(db, JSON.parse(process.argv[process.argv.length - 1]));
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
