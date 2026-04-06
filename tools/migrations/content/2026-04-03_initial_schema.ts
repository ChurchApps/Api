import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // 1. blocks
  await db.schema
    .createTable("blocks")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("blockType", sql`varchar(45)`)
    .addColumn("name", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  // 2. elements
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

  await db.schema.createIndex("idx_elements_churchId_blockId_sort").on("elements").columns(["churchId", "blockId", "sort"]).execute();

  // 3. pages
  await db.schema
    .createTable("pages")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("url", sql`varchar(255)`)
    .addColumn("title", sql`varchar(255)`)
    .addColumn("layout", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_pages_churchId_url").on("pages").columns(["churchId", "url"]).unique().execute();

  // 4. sections
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

  await db.schema.createIndex("idx_sections_churchId_pageId_sort").on("sections").columns(["churchId", "pageId", "sort"]).execute();
  await db.schema.createIndex("idx_sections_churchId_blockId_sort").on("sections").columns(["churchId", "blockId", "sort"]).execute();

  // 5. pageHistory
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
    .addColumn("createdDate", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_pageHistory_pageId_createdDate").on("pageHistory").columns(["pageId", "createdDate"]).execute();
  await db.schema.createIndex("idx_pageHistory_blockId_createdDate").on("pageHistory").columns(["blockId", "createdDate"]).execute();

  // 6. globalStyles
  await db.schema
    .createTable("globalStyles")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("fonts", sql`text`)
    .addColumn("palette", sql`text`)
    .addColumn("typography", sql`text`)
    .addColumn("spacing", sql`text`)
    .addColumn("borderRadius", sql`text`)
    .addColumn("customCss", sql`text`)
    .addColumn("customJS", sql`text`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // 7. links
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
    .addColumn("groupIds", sql`text`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci`)
    .execute();

  await db.schema.createIndex("idx_links_churchId").on("links").columns(["churchId"]).execute();

  // 8. settings
  await db.schema
    .createTable("settings")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("userId", sql`char(11)`)
    .addColumn("keyName", sql`varchar(255)`)
    .addColumn("value", sql`mediumtext`)
    .addColumn("public", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci`)
    .execute();

  await db.schema.createIndex("idx_settings_churchId").on("settings").columns(["churchId"]).execute();
  await db.schema.createIndex("idx_settings_churchId_keyName_userId").on("settings").columns(["churchId", "keyName", "userId"]).execute();

  // 9. files
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
    .addColumn("size", sql`int`)
    .addColumn("dateModified", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_files_churchId_id").on("files").columns(["churchId", "id"]).execute();

  // 10. playlists
  await db.schema
    .createTable("playlists")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("title", sql`varchar(255)`)
    .addColumn("description", sql`text`)
    .addColumn("publishDate", sql`datetime`)
    .addColumn("thumbnail", sql`varchar(1024)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  // 11. sermons
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
    .addColumn("description", sql`text`)
    .addColumn("publishDate", sql`datetime`)
    .addColumn("thumbnail", sql`varchar(1024)`)
    .addColumn("duration", sql`int`)
    .addColumn("permanentUrl", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  // 12. streamingServices
  await db.schema
    .createTable("streamingServices")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("serviceTime", sql`datetime`)
    .addColumn("earlyStart", sql`int`)
    .addColumn("chatBefore", sql`int`)
    .addColumn("chatAfter", sql`int`)
    .addColumn("provider", sql`varchar(45)`)
    .addColumn("providerKey", sql`varchar(255)`)
    .addColumn("videoUrl", sql`varchar(5000)`)
    .addColumn("timezoneOffset", sql`int`)
    .addColumn("recurring", sql`tinyint(4)`)
    .addColumn("label", sql`varchar(255)`)
    .addColumn("sermonId", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  // 13. events
  await db.schema
    .createTable("events")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("allDay", sql`bit(1)`)
    .addColumn("start", sql`datetime`)
    .addColumn("end", sql`datetime`)
    .addColumn("title", sql`varchar(255)`)
    .addColumn("description", sql`mediumtext`)
    .addColumn("visibility", sql`varchar(45)`)
    .addColumn("recurrenceRule", sql`varchar(255)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_events_churchId_groupId").on("events").columns(["churchId", "groupId"]).execute();

  // 14. eventExceptions
  await db.schema
    .createTable("eventExceptions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("eventId", sql`char(11)`)
    .addColumn("exceptionDate", sql`datetime`)
    .addColumn("recurrenceDate", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  // 15. curatedCalendars
  await db.schema
    .createTable("curatedCalendars")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  // 16. curatedEvents
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

  await db.schema.createIndex("idx_curatedEvents_churchId_curatedCalendarId").on("curatedEvents").columns(["churchId", "curatedCalendarId"]).execute();

  // 17. registrations
  await db.schema
    .createTable("registrations")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("eventId", sql`char(11)`, (col) => col.notNull())
    .addColumn("personId", sql`char(11)`)
    .addColumn("householdId", sql`char(11)`)
    .addColumn("status", sql`varchar(20)`, (col) => col.defaultTo("pending"))
    .addColumn("formSubmissionId", sql`char(11)`)
    .addColumn("notes", sql`mediumtext`)
    .addColumn("registeredDate", sql`datetime`)
    .addColumn("cancelledDate", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_registrations_churchId_eventId").on("registrations").columns(["churchId", "eventId"]).execute();
  await db.schema.createIndex("idx_registrations_personId").on("registrations").columns(["personId"]).execute();
  await db.schema.createIndex("idx_registrations_householdId").on("registrations").columns(["householdId"]).execute();

  // 18. registrationMembers
  await db.schema
    .createTable("registrationMembers")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("registrationId", sql`char(11)`, (col) => col.notNull())
    .addColumn("personId", sql`char(11)`)
    .addColumn("firstName", sql`varchar(100)`)
    .addColumn("lastName", sql`varchar(100)`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_registrationMembers_registrationId").on("registrationMembers").columns(["registrationId"]).execute();
  await db.schema.createIndex("idx_registrationMembers_personId").on("registrationMembers").columns(["personId"]).execute();

  // 19. songs
  await db.schema
    .createTable("songs")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("name", sql`varchar(45)`)
    .addColumn("dateAdded", sql`date`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_songs_churchId_name").on("songs").columns(["churchId", "name"]).execute();

  // 20. songDetails
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
    .addColumn("releaseDate", sql`date`)
    .addColumn("bpm", sql`int`)
    .addColumn("keySignature", sql`varchar(5)`)
    .addColumn("seconds", sql`int`)
    .addColumn("meter", sql`varchar(10)`)
    .addColumn("tones", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  // 21. songDetailLinks
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

  // 22. arrangements
  await db.schema
    .createTable("arrangements")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("songId", sql`char(11)`)
    .addColumn("songDetailId", sql`char(11)`)
    .addColumn("name", sql`varchar(45)`)
    .addColumn("lyrics", sql`text`)
    .addColumn("freeShowId", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_arrangements_churchId_songId").on("arrangements").columns(["churchId", "songId"]).execute();

  // 23. arrangementKeys
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

  // 24. bibleTranslations
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

  // 25. bibleBooks
  await db.schema
    .createTable("bibleBooks")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("translationKey", sql`varchar(45)`)
    .addColumn("keyName", sql`varchar(45)`)
    .addColumn("abbreviation", sql`varchar(45)`)
    .addColumn("name", sql`varchar(45)`)
    .addColumn("sort", sql`int`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_bibleBooks_translationKey").on("bibleBooks").columns(["translationKey"]).execute();

  // 26. bibleChapters
  await db.schema
    .createTable("bibleChapters")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("translationKey", sql`varchar(45)`)
    .addColumn("bookKey", sql`varchar(45)`)
    .addColumn("keyName", sql`varchar(45)`)
    .addColumn("number", sql`int`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_bibleChapters_translationKey_bookKey").on("bibleChapters").columns(["translationKey", "bookKey"]).execute();

  // 27. bibleVerses
  await db.schema
    .createTable("bibleVerses")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("translationKey", sql`varchar(45)`)
    .addColumn("chapterKey", sql`varchar(45)`)
    .addColumn("keyName", sql`varchar(45)`)
    .addColumn("number", sql`int`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_bibleVerses_translationKey_chapterKey").on("bibleVerses").columns(["translationKey", "chapterKey"]).execute();

  // 28. bibleVerseTexts
  await db.schema
    .createTable("bibleVerseTexts")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("translationKey", sql`varchar(45)`)
    .addColumn("verseKey", sql`varchar(45)`)
    .addColumn("bookKey", sql`varchar(45)`)
    .addColumn("chapterNumber", sql`int`)
    .addColumn("verseNumber", sql`int`)
    .addColumn("content", sql`varchar(1000)`)
    .addColumn("newParagraph", sql`bit`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_bibleVerseTexts_translationKey_verseKey").on("bibleVerseTexts").columns(["translationKey", "verseKey"]).unique().execute();

  // 29. bibleLookups
  await db.schema
    .createTable("bibleLookups")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("translationKey", sql`varchar(45)`)
    .addColumn("lookupTime", sql`datetime`)
    .addColumn("ipAddress", sql`varchar(45)`)
    .addColumn("startVerseKey", sql`varchar(15)`)
    .addColumn("endVerseKey", sql`varchar(15)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("bibleLookups").ifExists().execute();
  await db.schema.dropTable("bibleVerseTexts").ifExists().execute();
  await db.schema.dropTable("bibleVerses").ifExists().execute();
  await db.schema.dropTable("bibleChapters").ifExists().execute();
  await db.schema.dropTable("bibleBooks").ifExists().execute();
  await db.schema.dropTable("bibleTranslations").ifExists().execute();
  await db.schema.dropTable("arrangementKeys").ifExists().execute();
  await db.schema.dropTable("arrangements").ifExists().execute();
  await db.schema.dropTable("songDetailLinks").ifExists().execute();
  await db.schema.dropTable("songDetails").ifExists().execute();
  await db.schema.dropTable("songs").ifExists().execute();
  await db.schema.dropTable("registrationMembers").ifExists().execute();
  await db.schema.dropTable("registrations").ifExists().execute();
  await db.schema.dropTable("curatedEvents").ifExists().execute();
  await db.schema.dropTable("curatedCalendars").ifExists().execute();
  await db.schema.dropTable("eventExceptions").ifExists().execute();
  await db.schema.dropTable("events").ifExists().execute();
  await db.schema.dropTable("streamingServices").ifExists().execute();
  await db.schema.dropTable("sermons").ifExists().execute();
  await db.schema.dropTable("playlists").ifExists().execute();
  await db.schema.dropTable("files").ifExists().execute();
  await db.schema.dropTable("settings").ifExists().execute();
  await db.schema.dropTable("links").ifExists().execute();
  await db.schema.dropTable("globalStyles").ifExists().execute();
  await db.schema.dropTable("pageHistory").ifExists().execute();
  await db.schema.dropTable("sections").ifExists().execute();
  await db.schema.dropTable("pages").ifExists().execute();
  await db.schema.dropTable("elements").ifExists().execute();
  await db.schema.dropTable("blocks").ifExists().execute();
}
