import { pgTable, char, varchar, timestamp, date, boolean, integer, real, text, index, uniqueIndex } from "drizzle-orm/pg-core";

export const arrangementKeys = pgTable("arrangementKeys", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  arrangementId: char("arrangementId", { length: 11 }),
  keySignature: varchar("keySignature", { length: 10 }),
  shortDescription: varchar("shortDescription", { length: 45 })
});

export const arrangements = pgTable("arrangements", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  songId: char("songId", { length: 11 }),
  songDetailId: char("songDetailId", { length: 11 }),
  name: varchar("name", { length: 45 }),
  lyrics: text("lyrics"),
  freeShowId: varchar("freeShowId", { length: 45 })
}, (t) => [index("cnt_ix_churchId_songId").on(t.churchId, t.songId)]);

export const bibleBooks = pgTable("bibleBooks", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  translationKey: varchar("translationKey", { length: 45 }),
  keyName: varchar("keyName", { length: 45 }),
  abbreviation: varchar("abbreviation", { length: 45 }),
  name: varchar("name", { length: 45 }),
  sort: integer("sort")
}, (t) => [index("cnt_ix_translationKey").on(t.translationKey)]);

export const bibleChapters = pgTable("bibleChapters", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  translationKey: varchar("translationKey", { length: 45 }),
  bookKey: varchar("bookKey", { length: 45 }),
  keyName: varchar("keyName", { length: 45 }),
  number: integer("number")
}, (t) => [index("cnt_ix_translationKey_bookKey").on(t.translationKey, t.bookKey)]);

export const bibleLookups = pgTable("bibleLookups", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  translationKey: varchar("translationKey", { length: 45 }),
  lookupTime: timestamp("lookupTime"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  startVerseKey: varchar("startVerseKey", { length: 15 }),
  endVerseKey: varchar("endVerseKey", { length: 15 })
});

export const bibleTranslations = pgTable("bibleTranslations", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  abbreviation: varchar("abbreviation", { length: 10 }),
  name: varchar("name", { length: 255 }),
  nameLocal: varchar("nameLocal", { length: 255 }),
  description: varchar("description", { length: 1000 }),
  source: varchar("source", { length: 45 }),
  sourceKey: varchar("sourceKey", { length: 45 }),
  language: varchar("language", { length: 45 }),
  countries: varchar("countries", { length: 255 }),
  copyright: varchar("copyright", { length: 1000 }),
  attributionRequired: boolean("attributionRequired"),
  attributionString: varchar("attributionString", { length: 1000 })
});

export const bibleVerses = pgTable("bibleVerses", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  translationKey: varchar("translationKey", { length: 45 }),
  chapterKey: varchar("chapterKey", { length: 45 }),
  keyName: varchar("keyName", { length: 45 }),
  number: integer("number")
}, (t) => [index("cnt_ix_translationKey_chapterKey").on(t.translationKey, t.chapterKey)]);

export const bibleVerseTexts = pgTable("bibleVerseTexts", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  translationKey: varchar("translationKey", { length: 45 }),
  verseKey: varchar("verseKey", { length: 45 }),
  bookKey: varchar("bookKey", { length: 45 }),
  chapterNumber: integer("chapterNumber"),
  verseNumber: integer("verseNumber"),
  content: varchar("content", { length: 1000 }),
  newParagraph: boolean("newParagraph")
}, (t) => [uniqueIndex("cnt_uq_translationKey_verseKey").on(t.translationKey, t.verseKey)]);

export const blocks = pgTable("blocks", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  blockType: varchar("blockType", { length: 45 }),
  name: varchar("name", { length: 45 })
});

export const curatedCalendars = pgTable("curatedCalendars", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 45 })
});

export const curatedEvents = pgTable("curatedEvents", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  curatedCalendarId: char("curatedCalendarId", { length: 11 }),
  groupId: char("groupId", { length: 11 }),
  eventId: char("eventId", { length: 11 })
}, (t) => [index("cnt_ix_churchId_curatedCalendarId").on(t.churchId, t.curatedCalendarId)]);

export const elements = pgTable("elements", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  sectionId: char("sectionId", { length: 11 }),
  blockId: char("blockId", { length: 11 }),
  elementType: varchar("elementType", { length: 45 }),
  sort: real("sort"),
  parentId: char("parentId", { length: 11 }),
  answersJSON: text("answersJSON"),
  stylesJSON: text("stylesJSON"),
  animationsJSON: text("animationsJSON")
}, (t) => [index("cnt_ix_churchId_blockId_sort").on(t.churchId, t.blockId, t.sort)]);

export const eventExceptions = pgTable("eventExceptions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  eventId: char("eventId", { length: 11 }),
  exceptionDate: timestamp("exceptionDate"),
  recurrenceDate: timestamp("recurrenceDate")
});

export const events = pgTable("events", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  groupId: char("groupId", { length: 11 }),
  allDay: boolean("allDay"),
  start: timestamp("start"),
  end: timestamp("end"),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  visibility: varchar("visibility", { length: 45 }),
  recurrenceRule: varchar("recurrenceRule", { length: 255 }),
  registrationEnabled: boolean("registrationEnabled"),
  capacity: integer("capacity"),
  registrationOpenDate: timestamp("registrationOpenDate"),
  registrationCloseDate: timestamp("registrationCloseDate"),
  tags: varchar("tags", { length: 500 }),
  formId: char("formId", { length: 11 })
}, (t) => [index("cnt_ix_churchId_groupId").on(t.churchId, t.groupId)]);

export const files = pgTable("files", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: char("contentId", { length: 11 }),
  fileName: varchar("fileName", { length: 255 }),
  contentPath: varchar("contentPath", { length: 1024 }),
  fileType: varchar("fileType", { length: 45 }),
  size: integer("size"),
  dateModified: timestamp("dateModified")
}, (t) => [index("cnt_ix_churchId_id").on(t.churchId, t.id)]);

export const globalStyles = pgTable("globalStyles", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  fonts: text("fonts"),
  palette: text("palette"),
  typography: text("typography"),
  spacing: text("spacing"),
  borderRadius: text("borderRadius"),
  customCss: text("customCss"),
  customJS: text("customJS")
});

export const links = pgTable("links", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  category: varchar("category", { length: 45 }),
  url: varchar("url", { length: 255 }),
  linkType: varchar("linkType", { length: 45 }),
  linkData: varchar("linkData", { length: 255 }),
  icon: varchar("icon", { length: 45 }),
  text: varchar("text", { length: 255 }),
  sort: real("sort"),
  photo: varchar("photo", { length: 255 }),
  parentId: char("parentId", { length: 11 }),
  visibility: varchar("visibility", { length: 45 }).default("everyone"),
  groupIds: text("groupIds")
}, (t) => [index("cnt_links_churchId").on(t.churchId)]);

export const pageHistory = pgTable("pageHistory", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  pageId: char("pageId", { length: 11 }),
  blockId: char("blockId", { length: 11 }),
  snapshotJSON: text("snapshotJSON"),
  description: varchar("description", { length: 200 }),
  userId: char("userId", { length: 11 }),
  createdDate: timestamp("createdDate")
}, (t) => [
  index("cnt_ix_pageId").on(t.pageId, t.createdDate),
  index("cnt_ix_blockId").on(t.blockId, t.createdDate)
]);

export const pages = pgTable("pages", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  url: varchar("url", { length: 255 }),
  title: varchar("title", { length: 255 }),
  layout: varchar("layout", { length: 45 })
}, (t) => [uniqueIndex("cnt_uq_churchId_url").on(t.churchId, t.url)]);

export const playlists = pgTable("playlists", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  publishDate: timestamp("publishDate"),
  thumbnail: varchar("thumbnail", { length: 1024 })
});

export const registrationMembers = pgTable("registrationMembers", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  registrationId: char("registrationId", { length: 11 }).notNull(),
  personId: char("personId", { length: 11 }),
  firstName: varchar("firstName", { length: 100 }),
  lastName: varchar("lastName", { length: 100 })
}, (t) => [
  index("cnt_ix_regMembers_registrationId").on(t.registrationId),
  index("cnt_ix_regMembers_personId").on(t.personId)
]);

export const registrations = pgTable("registrations", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  eventId: char("eventId", { length: 11 }).notNull(),
  personId: char("personId", { length: 11 }),
  householdId: char("householdId", { length: 11 }),
  status: varchar("status", { length: 20 }).default("pending"),
  formSubmissionId: char("formSubmissionId", { length: 11 }),
  notes: text("notes"),
  registeredDate: timestamp("registeredDate"),
  cancelledDate: timestamp("cancelledDate")
}, (t) => [
  index("cnt_ix_registrations_churchId_eventId").on(t.churchId, t.eventId),
  index("cnt_ix_registrations_personId").on(t.personId),
  index("cnt_ix_registrations_householdId").on(t.householdId)
]);

export const sections = pgTable("sections", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  pageId: char("pageId", { length: 11 }),
  blockId: char("blockId", { length: 11 }),
  zone: varchar("zone", { length: 45 }),
  background: varchar("background", { length: 255 }),
  textColor: varchar("textColor", { length: 45 }),
  headingColor: varchar("headingColor", { length: 45 }),
  linkColor: varchar("linkColor", { length: 45 }),
  sort: real("sort"),
  targetBlockId: char("targetBlockId", { length: 11 }),
  answersJSON: text("answersJSON"),
  stylesJSON: text("stylesJSON"),
  animationsJSON: text("animationsJSON")
}, (t) => [
  index("cnt_ix_sections_churchId_pageId_sort").on(t.churchId, t.pageId, t.sort),
  index("cnt_ix_sections_churchId_blockId_sort").on(t.churchId, t.blockId, t.sort)
]);

export const sermons = pgTable("sermons", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  playlistId: char("playlistId", { length: 11 }),
  videoType: varchar("videoType", { length: 45 }),
  videoData: varchar("videoData", { length: 255 }),
  videoUrl: varchar("videoUrl", { length: 1024 }),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  publishDate: timestamp("publishDate"),
  thumbnail: varchar("thumbnail", { length: 1024 }),
  duration: integer("duration"),
  permanentUrl: boolean("permanentUrl")
});

export const contentSettings = pgTable("settings", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  userId: char("userId", { length: 11 }),
  keyName: varchar("keyName", { length: 255 }),
  value: text("value"),
  public: boolean("public")
}, (t) => [
  index("cnt_settings_churchId").on(t.churchId),
  index("cnt_ix_churchId_keyName_userId").on(t.churchId, t.keyName, t.userId)
]);

export const songDetailLinks = pgTable("songDetailLinks", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  songDetailId: char("songDetailId", { length: 11 }),
  service: varchar("service", { length: 45 }),
  serviceKey: varchar("serviceKey", { length: 255 }),
  url: varchar("url", { length: 255 })
});

export const songDetails = pgTable("songDetails", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  praiseChartsId: varchar("praiseChartsId", { length: 45 }),
  musicBrainzId: varchar("musicBrainzId", { length: 45 }),
  title: varchar("title", { length: 45 }),
  artist: varchar("artist", { length: 45 }),
  album: varchar("album", { length: 45 }),
  language: varchar("language", { length: 5 }),
  thumbnail: varchar("thumbnail", { length: 255 }),
  releaseDate: date("releaseDate", { mode: "date" }),
  bpm: integer("bpm"),
  keySignature: varchar("keySignature", { length: 5 }),
  seconds: integer("seconds"),
  meter: varchar("meter", { length: 10 }),
  tones: varchar("tones", { length: 45 })
});

export const songs = pgTable("songs", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 45 }),
  dateAdded: date("dateAdded", { mode: "date" })
}, (t) => [index("cnt_ix_churchId_name").on(t.churchId, t.name)]);

export const streamingServices = pgTable("streamingServices", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  serviceTime: timestamp("serviceTime"),
  earlyStart: integer("earlyStart"),
  chatBefore: integer("chatBefore"),
  chatAfter: integer("chatAfter"),
  provider: varchar("provider", { length: 45 }),
  providerKey: varchar("providerKey", { length: 255 }),
  videoUrl: varchar("videoUrl", { length: 5000 }),
  timezoneOffset: integer("timezoneOffset"),
  recurring: boolean("recurring"),
  label: varchar("label", { length: 255 }),
  sermonId: char("sermonId", { length: 11 })
});
