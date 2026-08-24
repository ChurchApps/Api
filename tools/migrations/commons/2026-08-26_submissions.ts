import { randomUUID } from "crypto";
import { type Kysely, sql } from "kysely";

// Submissions become the unit of moderation: every proposed change (new asset, author edit,
// third-party file) is a submissions row with a JSON payload and assetFiles rows; assets keep
// identity + visibility + counters only. assetLikes fold into assetRatings, abcSubmissions fold
// into submissions, and storage moves to commons/assets/{assetType}/{assetId}/{name}.
// Run tools/manual/commons-relocate-to-id-paths.ts BEFORE this migration on any environment
// holding real objects (local dev just re-runs reset-commons).

// uuid-derived rather than the app's shortId — a migration must not track evolving app code
const shortId = () => randomUUID().replace(/-/g, "").slice(0, 11);

function fileNames(files?: string | null): string[] {
  return (files || "").split(",").map((f) => f.trim()).filter(Boolean);
}

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("submissions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("assetId", sql`char(11)`, (col) => col.notNull())
    .addColumn("submittedBy", sql`char(11)`, (col) => col.notNull())
    .addColumn("status", sql`varchar(10)`, (col) => col.notNull().defaultTo("draft"))
    .addColumn("payload", "json", (col) => col.notNull())
    .addColumn("note", sql`varchar(500)`)
    .addColumn("triageScore", "integer")
    .addColumn("filesChanged", "json")
    .addColumn("reviewedBy", sql`char(11)`)
    .addColumn("reviewedAt", "datetime")
    .addColumn("reviewReason", sql`varchar(20)`)
    .addColumn("reviewNote", sql`varchar(500)`)
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("submittedAt", "datetime")
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_sub_queue").on("submissions").columns(["status", "submittedAt"]).execute();
  await db.schema.createIndex("idx_sub_asset").on("submissions").columns(["assetId", "status"]).execute();
  await db.schema.createIndex("idx_sub_submitter").on("submissions").columns(["submittedBy", "status"]).execute();

  await db.schema
    .createTable("assetFiles")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("assetId", sql`char(11)`, (col) => col.notNull())
    .addColumn("submissionId", sql`char(11)`)
    .addColumn("name", sql`varchar(100)`, (col) => col.notNull())
    .addColumn("action", sql`varchar(8)`, (col) => col.notNull().defaultTo("add"))
    .addColumn("sizeBytes", "integer")
    .addColumn("contentHash", sql`char(64)`)
    .addColumn("uploadedBy", sql`char(11)`)
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_files_live").on("assetFiles").columns(["assetId", "name", "submissionId"]).unique().execute();
  await db.schema.createIndex("idx_files_sub").on("assetFiles").column("submissionId").execute();
  await db.schema.createIndex("idx_files_hash").on("assetFiles").column("contentHash").execute();

  await db.schema
    .createTable("assetRatings")
    .ifNotExists()
    .addColumn("assetId", sql`char(11)`, (col) => col.notNull())
    .addColumn("userId", sql`char(11)`, (col) => col.notNull())
    .addColumn("stars", sql`tinyint`)
    .addColumn("saved", sql`bit(1)`, (col) => col.notNull().defaultTo(sql`b'0'`))
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("modifiedAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addPrimaryKeyConstraint("pk_asset_ratings", ["assetId", "userId"])
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_ratings_user").on("assetRatings").columns(["userId", "saved"]).execute();

  await sql`alter table assets
    add column publishedSubmissionId char(11) null,
    add column removedReason varchar(20) null,
    add column unpublishedAt datetime null,
    add column publishedAt datetime null,
    add column ratingCount int not null default 0,
    add column ratingSum int not null default 0,
    modify column status varchar(12) not null default 'pending'`.execute(db);
  await sql`update assets set status = 'published', publishedAt = createdAt where status = 'approved'`.execute(db);
  await sql`update assets set removedReason = 'policy' where status = 'removed'`.execute(db);

  const assets = await db.selectFrom("assets").leftJoin("songs", "songs.assetId", "assets.id").leftJoin("authors", "authors.id", "songs.authorId")
    .select(["assets.id", "assets.assetType", "assets.name", "assets.description", "assets.tags", "assets.language", "assets.license",
      "assets.publisherUserId", "assets.publisherChurchId", "assets.status", "assets.createdAt", "assets.files", "assets.appMinVersion",
      "songs.year", "songs.songKey", "songs.bpm", "songs.timeSignature", "songs.scripture", "songs.scriptureText", "songs.chordPro",
      "songs.videoUrl", "songs.parentSongId", "songs.relationLabel", "songs.proAnswer", "songs.certified", "authors.name as writer"]).execute();

  for (const a of assets) {
    for (const name of fileNames(a.files)) {
      await db.insertInto("assetFiles").values({ id: shortId(), assetId: a.id, submissionId: null, name, action: "add", uploadedBy: a.publisherUserId }).execute();
    }
    const detail: Record<string, unknown> = {};
    if (a.assetType === "song") {
      for (const k of ["year", "songKey", "bpm", "timeSignature", "scripture", "scriptureText", "chordPro", "videoUrl", "parentSongId", "relationLabel", "proAnswer", "writer"] as const) {
        if (a[k] !== null && a[k] !== undefined) detail[k] = a[k];
      }
      detail.certified = !!a.certified;
    } else if (a.appMinVersion) detail.appMinVersion = a.appMinVersion;
    const payload = { name: a.name, description: a.description, tags: a.tags, language: a.language, license: a.license, publisherChurchId: a.publisherChurchId, detail };
    const submissionStatus = a.status === "pending" ? "pending" : "approved";
    const subId = shortId();
    await db.insertInto("submissions").values({
      id: subId,
      assetId: a.id,
      submittedBy: a.publisherUserId || "unknown",
      status: submissionStatus,
      payload: JSON.stringify(payload),
      note: "Imported",
      submittedAt: a.createdAt,
      reviewedAt: submissionStatus === "approved" ? a.createdAt : null
    }).execute();
    if (submissionStatus === "approved") await db.updateTable("assets").set({ publishedSubmissionId: subId }).where("id", "=", a.id).execute();
    else await db.updateTable("assetFiles").set({ submissionId: subId }).where("assetId", "=", a.id).execute();
  }

  await sql`insert ignore into assetRatings (assetId, userId, stars, saved, createdAt, modifiedAt)
    select assetId, userId, null, b'1', timeAdded, timeAdded from assetLikes`.execute(db);
  await db.schema.dropTable("assetLikes").ifExists().execute();
  await sql`alter table assets drop column likeCount`.execute(db);

  // pending abc rows keep their id as the submission id so the relocate tool's
  // commons/pending/{id}/tune.abc export lines up
  const abcRows = await db.selectFrom("abcSubmissions").selectAll().execute();
  for (const r of abcRows) {
    const status = r.status === "approved" ? "approved" : r.status === "rejected" ? "rejected" : "pending";
    await db.insertInto("submissions").values({
      id: r.id,
      assetId: r.songId,
      submittedBy: r.submittedBy,
      status,
      payload: JSON.stringify({ detail: {} }),
      note: "ABC transcription",
      submittedAt: r.createdAt,
      reviewedAt: status === "pending" ? null : r.createdAt,
      reviewReason: status === "rejected" ? "other" : null,
      filesChanged: status === "approved" ? JSON.stringify([{ name: "tune.abc", action: "add" }]) : null
    }).execute();
    if (status === "pending") {
      await db.insertInto("assetFiles").values({ id: shortId(), assetId: r.songId, submissionId: r.id, name: "tune.abc", action: "add", sizeBytes: Buffer.byteLength(r.abc || ""), uploadedBy: r.submittedBy }).execute();
    }
  }
  await db.schema.dropTable("abcSubmissions").ifExists().execute();

  await sql`alter table reports
    add column reason varchar(12) not null default 'copyright',
    add column reporterUserId char(11) null,
    add column resolution varchar(12) null,
    add column resolutionNote varchar(500) null,
    add column reviewedBy char(11) null,
    add column reviewedAt datetime null`.execute(db);
  await sql`update reports set resolution = 'dismissed', reviewedAt = createdAt where status = 'resolved'`.execute(db);
  await db.schema.dropIndex("idx_reports_status").on("reports").execute();
  await db.schema.createIndex("idx_reports_status").on("reports").columns(["status", "createdAt"]).execute();
  await db.schema.createIndex("idx_reports_asset").on("reports").column("assetId").execute();

  await sql`alter table assetDownloads add column ymd date null`.execute(db);
  await sql`update assetDownloads set ymd = date(createdAt)`.execute(db);
  await sql`alter table assetDownloads modify column ymd date not null, drop primary key, add primary key (assetId, ipHash, ymd)`.execute(db);
  await db.schema.createIndex("idx_downloads_prune").on("assetDownloads").column("ymd").execute();

  await db.schema.dropIndex("idx_assets_hash").on("assets").execute();
  await db.schema.dropIndex("idx_assets_browse").on("assets").execute();
  await sql`alter table assets drop column path, drop column files, drop column contentHash, drop column version, drop column appMinVersion,
    drop column reviewedBy, drop column reviewedAt`.execute(db);
  await db.schema.createIndex("idx_assets_browse").on("assets").columns(["status", "assetType", "featured"]).execute();
  await db.schema.createIndex("idx_assets_downloads").on("assets").columns(["status", "assetType", "downloadCount"]).execute();
  await db.schema.createIndex("idx_assets_published").on("assets").columns(["status", "assetType", "publishedAt"]).execute();
}

// Best effort: file hashes, per-file credit, rejection reasons and the id-path storage
// layout are unrecoverable. path/files are rebuilt from the live assetFiles rows.
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table assets add column path varchar(255) null, add column files varchar(500) null, add column contentHash char(64) null,
    add column version varchar(20) null, add column appMinVersion varchar(20) null, add column reviewedBy char(11) null, add column reviewedAt datetime null,
    add column likeCount int not null default 0`.execute(db);
  const assets = await db.selectFrom("assets").select(["id", "assetType", "status"]).execute();
  for (const a of assets) {
    const files = await db.selectFrom("assetFiles").select("name").where("assetId", "=", a.id).where("submissionId", "is", null).execute();
    await db.updateTable("assets").set({ path: `commons/assets/${a.assetType}/${a.id}`, files: files.map((f) => f.name).join(",") || null }).where("id", "=", a.id).execute();
  }
  await sql`update assets set status = 'approved' where status in ('published', 'unpublished')`.execute(db);
  await sql`update assets a set likeCount = (select count(*) from assetRatings r where r.assetId = a.id and r.saved = b'1')`.execute(db);

  await db.schema
    .createTable("assetLikes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("assetId", sql`char(11)`, (col) => col.notNull())
    .addColumn("userId", sql`char(11)`, (col) => col.notNull())
    .addColumn("timeAdded", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_asset_likes_unique").on("assetLikes").columns(["assetId", "userId"]).unique().execute();
  await sql`insert into assetLikes (id, assetId, userId, timeAdded)
    select substring(replace(uuid(), '-', ''), 1, 11), assetId, userId, createdAt from assetRatings where saved = b'1'`.execute(db);

  await db.schema
    .createTable("abcSubmissions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.primaryKey())
    .addColumn("songId", sql`char(11)`, (col) => col.notNull())
    .addColumn("abc", "text", (col) => col.notNull())
    .addColumn("submittedBy", sql`char(11)`, (col) => col.notNull())
    .addColumn("status", sql`varchar(20)`, (col) => col.notNull().defaultTo("pending"))
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_abc_status").on("abcSubmissions").column("status").execute();

  await sql`alter table reports drop column reason, drop column reporterUserId, drop column resolution, drop column resolutionNote,
    drop column reviewedBy, drop column reviewedAt`.execute(db);
  await db.schema.dropIndex("idx_reports_asset").on("reports").execute();
  await db.schema.dropIndex("idx_reports_status").on("reports").execute();
  await db.schema.createIndex("idx_reports_status").on("reports").column("status").execute();

  await db.schema.dropIndex("idx_downloads_prune").on("assetDownloads").execute();
  await sql`delete d1 from assetDownloads d1 join assetDownloads d2 on d1.assetId = d2.assetId and d1.ipHash = d2.ipHash and d1.ymd > d2.ymd`.execute(db);
  await sql`alter table assetDownloads drop primary key, drop column ymd, add primary key (assetId, ipHash)`.execute(db);

  await db.schema.dropIndex("idx_assets_published").on("assets").execute();
  await db.schema.dropIndex("idx_assets_downloads").on("assets").execute();
  await db.schema.dropIndex("idx_assets_browse").on("assets").execute();
  await sql`alter table assets drop column publishedSubmissionId, drop column removedReason, drop column unpublishedAt, drop column publishedAt,
    drop column ratingCount, drop column ratingSum, modify column status varchar(10) not null default 'pending'`.execute(db);
  await db.schema.createIndex("idx_assets_browse").on("assets").columns(["status", "assetType"]).execute();
  await db.schema.createIndex("idx_assets_hash").on("assets").column("contentHash").execute();

  await db.schema.dropTable("assetRatings").ifExists().execute();
  await db.schema.dropTable("assetFiles").ifExists().execute();
  await db.schema.dropTable("submissions").ifExists().execute();
}
