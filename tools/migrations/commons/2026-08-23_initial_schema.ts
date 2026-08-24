import { type Kysely, sql } from "kysely";

// Consolidated schema for the commons module: the WorshipCommonsApi song vertical as it
// stood after its ~30 incremental migrations, plus the generic asset family. The reports
// table is generalized across content families (contentType "song" | "asset").
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("songs")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("title", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("writer", sql`varchar(255)`)
    .addColumn("year", "integer")
    .addColumn("themes", sql`varchar(255)`)
    .addColumn("songKey", sql`varchar(10)`)
    .addColumn("bpm", "integer")
    .addColumn("timeSignature", sql`varchar(10)`)
    .addColumn("language", sql`varchar(50)`)
    .addColumn("scripture", sql`varchar(100)`)
    .addColumn("scriptureText", sql`varchar(500)`)
    .addColumn("license", sql`varchar(2)`)
    .addColumn("churchCount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("hymnalCount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("chordPro", "text")
    .addColumn("demoAudioUrl", sql`varchar(255)`)
    .addColumn("demoAudioBytes", "integer")
    .addColumn("sheetPdfUrl", sql`varchar(255)`)
    .addColumn("sheetPdfBytes", "integer")
    .addColumn("stemsZipUrl", sql`varchar(255)`)
    .addColumn("stemsZipBytes", "integer")
    .addColumn("midiUrl", sql`varchar(255)`)
    .addColumn("midiBytes", "integer")
    .addColumn("lyricsUrl", sql`varchar(255)`)
    .addColumn("abcUrl", sql`varchar(255)`)
    .addColumn("videoUrl", sql`varchar(255)`)
    .addColumn("writerPortraitUrl", sql`varchar(255)`)
    .addColumn("writerBio", sql`varchar(1000)`)
    .addColumn("artUrl", sql`varchar(255)`)
    .addColumn("parentSongId", sql`char(11)`)
    .addColumn("relationLabel", sql`varchar(150)`)
    .addColumn("status", sql`varchar(10)`, (col) => col.notNull().defaultTo("pending"))
    .addColumn("submittedBy", sql`char(11)`)
    .addColumn("proAnswer", sql`varchar(150)`)
    .addColumn("certified", sql`bit(1)`)
    .addColumn("qualityScore", "integer")
    .addColumn("qualityDetail", "text")
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("updatedAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_songs_status").on("songs").column("status").execute();
  await db.schema.createIndex("idx_songs_parent").on("songs").column("parentSongId").execute();
  await db.schema.createIndex("idx_songs_submitter").on("songs").column("submittedBy").execute();

  await db.schema
    .createTable("reports")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("contentType", sql`varchar(10)`, (col) => col.notNull().defaultTo("song"))
    .addColumn("contentId", sql`char(11)`)
    .addColumn("contentText", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("reporterRole", sql`varchar(150)`)
    .addColumn("details", "text")
    .addColumn("name", sql`varchar(100)`)
    .addColumn("email", sql`varchar(100)`)
    .addColumn("signature", sql`varchar(100)`)
    .addColumn("status", sql`varchar(10)`, (col) => col.notNull().defaultTo("open"))
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_reports_status").on("reports").columns(["status", "contentType"]).execute();

  // churchCount drives the default sort but /sing is anonymous and unthrottled;
  // dedupe by (songId, hashed IP) so one network can only count a song once
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

  // community ABC transcriptions awaiting review — approved ones are promoted by
  // hand to the song's folder in the WorshipCommonsContent repo
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

  await db.schema
    .createTable("assets")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("assetType", sql`varchar(50)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("tags", "text")
    .addColumn("language", sql`varchar(50)`)
    .addColumn("license", sql`varchar(10)`)
    .addColumn("publisherUserId", sql`char(11)`)
    .addColumn("publisherChurchId", sql`char(11)`)
    .addColumn("status", sql`varchar(10)`, (col) => col.notNull().defaultTo("pending"))
    .addColumn("contentPath", sql`varchar(255)`)
    .addColumn("thumbPath", sql`varchar(255)`)
    .addColumn("sizeBytes", "integer")
    .addColumn("contentHash", sql`char(64)`)
    .addColumn("version", sql`varchar(20)`)
    .addColumn("appMinVersion", sql`varchar(20)`)
    .addColumn("downloadCount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("likeCount", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("featured", sql`tinyint(1)`, (col) => col.notNull().defaultTo(0))
    .addColumn("reviewedBy", sql`char(11)`)
    .addColumn("reviewedAt", "datetime")
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("modifiedAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_assets_browse").on("assets").columns(["status", "assetType"]).execute();
  await db.schema.createIndex("idx_assets_publisher").on("assets").column("publisherUserId").execute();
  // plain index, not unique: rejected ("removed") rows keep their hash, so duplicates are legal here
  await db.schema.createIndex("idx_assets_hash").on("assets").column("contentHash").execute();

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

  // same shape as sings: anonymous download counts deduped by hashed IP
  await db.schema
    .createTable("assetDownloads")
    .ifNotExists()
    .addColumn("assetId", sql`char(11)`, (col) => col.notNull())
    .addColumn("ipHash", sql`char(16)`, (col) => col.notNull())
    .addColumn("createdAt", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addPrimaryKeyConstraint("pk_asset_downloads", ["assetId", "ipHash"])
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("assetDownloads").ifExists().execute();
  await db.schema.dropTable("assetLikes").ifExists().execute();
  await db.schema.dropTable("assets").ifExists().execute();
  await db.schema.dropTable("abcSubmissions").ifExists().execute();
  await db.schema.dropTable("libraries").ifExists().execute();
  await db.schema.dropTable("sings").ifExists().execute();
  await db.schema.dropTable("reports").ifExists().execute();
  await db.schema.dropTable("songs").ifExists().execute();
}
