import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // === Events ===

  await db.schema
    .createTable("events")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("allDay", sql`bit(1)`)
    .addColumn("start", "datetime")
    .addColumn("end", "datetime")
    .addColumn("title", sql`varchar(255)`)
    .addColumn("description", sql`mediumtext`)
    .addColumn("visibility", sql`varchar(45)`)
    .addColumn("recurrenceRule", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createIndex("events_ix_churchId_groupId")
    .on("events")
    .columns(["churchId", "groupId"])
    .execute();

  await db.schema
    .createTable("eventExceptions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("eventId", sql`char(11)`)
    .addColumn("exceptionDate", "datetime")
    .addColumn("recurrenceDate", "datetime")
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createTable("curatedCalendars")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createTable("curatedEvents")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("curatedCalendarId", sql`char(11)`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("eventId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createIndex("curatedEvents_ix_churchId_curatedCalendarId")
    .on("curatedEvents")
    .columns(["churchId", "curatedCalendarId"])
    .execute();

  // === Streaming ===

  await db.schema
    .createTable("playlists")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("title", sql`varchar(255)`)
    .addColumn("description", "text")
    .addColumn("publishDate", "datetime")
    .addColumn("thumbnail", sql`varchar(1024)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createTable("sermons")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("playlistId", sql`char(11)`)
    .addColumn("videoType", sql`varchar(45)`)
    .addColumn("videoData", sql`varchar(255)`)
    .addColumn("videoUrl", sql`varchar(1024)`)
    .addColumn("title", sql`varchar(255)`)
    .addColumn("description", "text")
    .addColumn("publishDate", "datetime")
    .addColumn("thumbnail", sql`varchar(1024)`)
    .addColumn("duration", sql`int(11)`)
    .addColumn("permanentUrl", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createTable("streamingServices")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("serviceTime", "datetime")
    .addColumn("earlyStart", sql`int(11)`)
    .addColumn("chatBefore", sql`int(11)`)
    .addColumn("chatAfter", sql`int(11)`)
    .addColumn("provider", sql`varchar(45)`)
    .addColumn("providerKey", sql`varchar(255)`)
    .addColumn("videoUrl", sql`varchar(5000)`)
    .addColumn("timezoneOffset", sql`int(11)`)
    .addColumn("recurring", sql`tinyint(4)`)
    .addColumn("label", sql`varchar(255)`)
    .addColumn("sermonId", sql`char(11)`)
    .addUniqueConstraint("streamingServices_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  // === Content ===

  await db.schema
    .createTable("blocks")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("blockType", sql`varchar(45)`)
    .addColumn("name", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createTable("elements")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("sectionId", sql`char(11)`)
    .addColumn("blockId", sql`char(11)`)
    .addColumn("elementType", sql`varchar(45)`)
    .addColumn("sort", sql`float`)
    .addColumn("parentId", sql`char(11)`)
    .addColumn("answersJSON", sql`mediumtext`)
    .addColumn("stylesJSON", sql`mediumtext`)
    .addColumn("animationsJSON", sql`mediumtext`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createIndex("elements_ix_churchId_blockId_sort")
    .on("elements")
    .columns(["churchId", "blockId", "sort"])
    .execute();

  await db.schema
    .createTable("globalStyles")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("fonts", "text")
    .addColumn("palette", "text")
    .addColumn("typography", "text")
    .addColumn("spacing", "text")
    .addColumn("borderRadius", "text")
    .addColumn("customCss", "text")
    .addColumn("customJS", "text")
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("pages")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("url", sql`varchar(255)`)
    .addColumn("title", sql`varchar(255)`)
    .addColumn("layout", sql`varchar(45)`)
    .addUniqueConstraint("pages_uq_churchId_url", ["churchId", "url"])
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createTable("sections")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("pageId", sql`char(11)`)
    .addColumn("blockId", sql`char(11)`)
    .addColumn("zone", sql`varchar(45)`)
    .addColumn("background", sql`varchar(255)`)
    .addColumn("textColor", sql`varchar(45)`)
    .addColumn("headingColor", sql`varchar(45)`)
    .addColumn("linkColor", sql`varchar(45)`)
    .addColumn("sort", sql`float`)
    .addColumn("targetBlockId", sql`char(11)`)
    .addColumn("answersJSON", sql`mediumtext`)
    .addColumn("stylesJSON", sql`mediumtext`)
    .addColumn("animationsJSON", sql`mediumtext`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createIndex("sections_ix_churchId_pageId_sort")
    .on("sections")
    .columns(["churchId", "pageId", "sort"])
    .execute();

  await db.schema
    .createIndex("sections_ix_churchId_blockId_sort")
    .on("sections")
    .columns(["churchId", "blockId", "sort"])
    .execute();

  await db.schema
    .createTable("links")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("category", sql`varchar(45)`)
    .addColumn("url", sql`varchar(255)`)
    .addColumn("linkType", sql`varchar(45)`)
    .addColumn("linkData", sql`varchar(255)`)
    .addColumn("icon", sql`varchar(45)`)
    .addColumn("text", sql`varchar(255)`)
    .addColumn("sort", sql`float`)
    .addColumn("photo", sql`varchar(255)`)
    .addColumn("parentId", sql`char(11)`)
    .addColumn("visibility", sql`varchar(45)`, (col) => col.defaultTo("everyone"))
    .addColumn("groupIds", "text")
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci`)
    .execute();

  await db.schema
    .createIndex("links_churchId")
    .on("links")
    .column("churchId")
    .execute();

  await db.schema
    .createTable("files")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("contentType", sql`varchar(45)`)
    .addColumn("contentId", sql`char(11)`)
    .addColumn("fileName", sql`varchar(255)`)
    .addColumn("contentPath", sql`varchar(1024)`)
    .addColumn("fileType", sql`varchar(45)`)
    .addColumn("size", sql`int(11)`)
    .addColumn("dateModified", "datetime")
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema
    .createIndex("files_ix_churchId_id")
    .on("files")
    .columns(["churchId", "id"])
    .execute();

  await db.schema
    .createTable("settings")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("userId", sql`char(11)`)
    .addColumn("keyName", sql`varchar(255)`)
    .addColumn("value", sql`mediumtext`)
    .addColumn("public", sql`bit(1)`)
    .addUniqueConstraint("settings_id_UNIQUE", ["id"])
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci`)
    .execute();

  await db.schema
    .createIndex("settings_churchId")
    .on("settings")
    .column("churchId")
    .execute();

  await db.schema
    .createIndex("settings_ix_churchId_keyName_userId")
    .on("settings")
    .columns(["churchId", "keyName", "userId"])
    .execute();

  await db.schema
    .createTable("pageHistory")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("pageId", sql`char(11)`)
    .addColumn("blockId", sql`char(11)`)
    .addColumn("snapshotJSON", sql`longtext`)
    .addColumn("description", sql`varchar(200)`)
    .addColumn("userId", sql`char(11)`)
    .addColumn("createdDate", "datetime", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createIndex("pageHistory_ix_pageId")
    .on("pageHistory")
    .columns(["pageId", "createdDate"])
    .execute();

  await db.schema
    .createIndex("pageHistory_ix_blockId")
    .on("pageHistory")
    .columns(["blockId", "createdDate"])
    .execute();

  // === Bible ===

  await db.schema
    .createTable("bibleTranslations")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("abbreviation", sql`varchar(10)`)
    .addColumn("name", sql`varchar(255)`)
    .addColumn("nameLocal", sql`varchar(255)`)
    .addColumn("description", sql`varchar(1000)`)
    .addColumn("source", sql`varchar(45)`)
    .addColumn("sourceKey", sql`varchar(45)`)
    .addColumn("language", sql`varchar(45)`)
    .addColumn("countries", sql`varchar(255)`)
    .addColumn("copyright", sql`varchar(1000)`)
    .addColumn("attributionRequired", sql`bit`)
    .addColumn("attributionString", sql`varchar(1000)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("bibleBooks")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("translationKey", sql`varchar(45)`)
    .addColumn("keyName", sql`varchar(45)`)
    .addColumn("abbreviation", sql`varchar(45)`)
    .addColumn("name", sql`varchar(45)`)
    .addColumn("sort", sql`int(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("bibleBooks_ix_translationKey")
    .on("bibleBooks")
    .column("translationKey")
    .execute();

  await db.schema
    .createTable("bibleChapters")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("translationKey", sql`varchar(45)`)
    .addColumn("bookKey", sql`varchar(45)`)
    .addColumn("keyName", sql`varchar(45)`)
    .addColumn("number", sql`int(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("bibleChapters_ix_translationKey_bookKey")
    .on("bibleChapters")
    .columns(["translationKey", "bookKey"])
    .execute();

  await db.schema
    .createTable("bibleVerses")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("translationKey", sql`varchar(45)`)
    .addColumn("chapterKey", sql`varchar(45)`)
    .addColumn("keyName", sql`varchar(45)`)
    .addColumn("number", sql`int(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("bibleVerses_ix_translationKey_chapterKey")
    .on("bibleVerses")
    .columns(["translationKey", "chapterKey"])
    .execute();

  await db.schema
    .createTable("bibleVerseTexts")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("translationKey", sql`varchar(45)`)
    .addColumn("verseKey", sql`varchar(45)`)
    .addColumn("bookKey", sql`varchar(45)`)
    .addColumn("chapterNumber", "integer")
    .addColumn("verseNumber", "integer")
    .addColumn("content", sql`varchar(1000)`)
    .addColumn("newParagraph", sql`bit`)
    .addUniqueConstraint("bibleVerseTexts_uq_translationKey_verseKey", ["translationKey", "verseKey"])
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("bibleVerseTexts_ix_translationKey_verseKey")
    .on("bibleVerseTexts")
    .columns(["translationKey", "verseKey"])
    .execute();

  await db.schema
    .createTable("bibleLookups")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("translationKey", sql`varchar(45)`)
    .addColumn("lookupTime", "datetime")
    .addColumn("ipAddress", sql`varchar(45)`)
    .addColumn("startVerseKey", sql`varchar(15)`)
    .addColumn("endVerseKey", sql`varchar(15)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // === Songs ===

  await db.schema
    .createTable("arrangements")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("songId", sql`char(11)`)
    .addColumn("songDetailId", sql`char(11)`)
    .addColumn("name", sql`varchar(45)`)
    .addColumn("lyrics", "text")
    .addColumn("freeShowId", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("arrangements_ix_churchId_songId")
    .on("arrangements")
    .columns(["churchId", "songId"])
    .execute();

  await db.schema
    .createTable("arrangementKeys")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("arrangementId", sql`char(11)`)
    .addColumn("keySignature", sql`varchar(10)`)
    .addColumn("shortDescription", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("songDetailLinks")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("songDetailId", sql`char(11)`)
    .addColumn("service", sql`varchar(45)`)
    .addColumn("serviceKey", sql`varchar(255)`)
    .addColumn("url", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("songDetails")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("praiseChartsId", sql`varchar(45)`)
    .addColumn("musicBrainzId", sql`varchar(45)`)
    .addColumn("title", sql`varchar(45)`)
    .addColumn("artist", sql`varchar(45)`)
    .addColumn("album", sql`varchar(45)`)
    .addColumn("language", sql`varchar(5)`)
    .addColumn("thumbnail", sql`varchar(255)`)
    .addColumn("releaseDate", "date")
    .addColumn("bpm", sql`int(11)`)
    .addColumn("keySignature", sql`varchar(5)`)
    .addColumn("seconds", sql`int(11)`)
    .addColumn("meter", sql`varchar(10)`)
    .addColumn("tones", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("songs")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(45)`)
    .addColumn("dateAdded", "date")
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createIndex("songs_ix_churchId_name")
    .on("songs")
    .columns(["churchId", "name"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  const tables = [
    "songs",
    "songDetails",
    "songDetailLinks",
    "arrangementKeys",
    "arrangements",
    "bibleLookups",
    "bibleVerseTexts",
    "bibleVerses",
    "bibleChapters",
    "bibleBooks",
    "bibleTranslations",
    "pageHistory",
    "settings",
    "files",
    "links",
    "sections",
    "pages",
    "globalStyles",
    "elements",
    "blocks",
    "streamingServices",
    "sermons",
    "playlists",
    "curatedEvents",
    "curatedCalendars",
    "eventExceptions",
    "events",
  ];

  for (const table of tables) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
