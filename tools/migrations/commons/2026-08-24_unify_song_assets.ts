import { type Kysely, sql } from "kysely";

// Songs fold onto the generic asset spine: every song becomes an assets row (assetType "song")
// and the songs table becomes a satellite of domain-only detail keyed by assetId. Approval,
// download tallies, likes and reports are then one system, so sings/libraries go away.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`insert into assets (id, assetType, name, tags, language, license, publisherUserId, status, thumbPath, downloadCount, likeCount, featured, createdAt, modifiedAt)
    select s.id, 'song', s.title, s.themes, s.language, s.license, s.submittedBy, s.status, s.artUrl, 0,
      (select count(*) from libraries l where l.songId = s.id), 0, s.createdAt, s.updatedAt
    from songs s`.execute(db);

  // uuid-substring rather than the app's shortId — a migration has no access to UniqueIdHelper
  await sql`insert into assetLikes (id, assetId, userId, timeAdded)
    select substring(replace(uuid(), '-', ''), 1, 11), l.songId, l.userId, l.createdAt
    from libraries l join assets a on a.id = l.songId`.execute(db);

  await db.schema.dropIndex("idx_songs_status").on("songs").execute();
  await db.schema.dropIndex("idx_songs_submitter").on("songs").execute();

  await sql`alter table songs add column assetId char(11) null`.execute(db);
  await sql`update songs set assetId = id`.execute(db);
  await sql`alter table songs drop primary key`.execute(db);
  await sql`alter table songs drop column id, drop column title, drop column themes, drop column language, drop column license,
    drop column status, drop column submittedBy, drop column churchCount, drop column artUrl, drop column createdAt, drop column updatedAt`.execute(db);
  await sql`alter table songs modify column assetId char(11) not null, add primary key (assetId)`.execute(db);

  await sql`alter table reports add column assetId char(11) null`.execute(db);
  await sql`update reports set assetId = contentId where contentType = 'song'`.execute(db);
  await db.schema.dropIndex("idx_reports_status").on("reports").execute();
  await sql`alter table reports drop column contentType, drop column contentId`.execute(db);
  await db.schema.createIndex("idx_reports_status").on("reports").column("status").execute();

  await db.schema.dropTable("libraries").ifExists().execute();
  await db.schema.dropTable("sings").ifExists().execute();
}

// Best effort: the spine columns are copied back, but churchCount and the sings history
// were folded into asset counters and cannot be recovered.
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("sings")
    .ifNotExists()
    .addColumn("songId", sql`char(11)`, (col) => col.notNull())
    .addColumn("ipHash", sql`char(16)`, (col) => col.notNull())
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addPrimaryKeyConstraint("pk_sings", ["songId", "ipHash"])
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createTable("libraries")
    .ifNotExists()
    .addColumn("userId", sql`char(11)`, (col) => col.notNull())
    .addColumn("songId", sql`char(11)`, (col) => col.notNull())
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addPrimaryKeyConstraint("pk_libraries", ["userId", "songId"])
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await sql`insert into libraries (userId, songId, createdAt)
    select al.userId, al.assetId, al.timeAdded from assetLikes al join assets a on a.id = al.assetId and a.assetType = 'song'`.execute(db);

  await sql`alter table songs add column id char(11) null, add column title varchar(255) null, add column themes varchar(255) null,
    add column language varchar(50) null, add column license varchar(2) null, add column status varchar(10) not null default 'pending',
    add column submittedBy char(11) null, add column churchCount int not null default 0, add column artUrl varchar(255) null,
    add column createdAt datetime null, add column updatedAt datetime null`.execute(db);
  await sql`update songs s join assets a on a.id = s.assetId
    set s.id = a.id, s.title = a.name, s.themes = a.tags, s.language = a.language, s.license = a.license, s.status = a.status,
      s.submittedBy = a.publisherUserId, s.artUrl = a.thumbPath, s.createdAt = a.createdAt, s.updatedAt = a.modifiedAt`.execute(db);
  await sql`delete from songs where id is null`.execute(db);
  await sql`alter table songs drop primary key, drop column assetId, modify column id char(11) not null,
    modify column title varchar(255) not null, add primary key (id)`.execute(db);

  await db.schema.createIndex("idx_songs_status").on("songs").column("status").execute();
  await db.schema.createIndex("idx_songs_submitter").on("songs").column("submittedBy").execute();

  await sql`delete from assetLikes where assetId in (select id from assets where assetType = 'song')`.execute(db);
  await sql`delete from assetDownloads where assetId in (select id from assets where assetType = 'song')`.execute(db);
  await sql`delete from assets where assetType = 'song'`.execute(db);

  await sql`alter table reports add column contentType varchar(10) not null default 'song', add column contentId char(11) null`.execute(db);
  await sql`update reports set contentId = assetId`.execute(db);
  await db.schema.dropIndex("idx_reports_status").on("reports").execute();
  await sql`alter table reports drop column assetId`.execute(db);
  await db.schema.createIndex("idx_reports_status").on("reports").columns(["status", "contentType"]).execute();
}
