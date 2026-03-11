import { mysqlTable, char, varchar, datetime, date, boolean, int, float, text, mediumtext, longtext, index, uniqueIndex } from "drizzle-orm/mysql-core";

export const arrangementKeys = mysqlTable("arrangementKeys", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  arrangementId: char("arrangementId", { length: 11 }),
  keySignature: varchar("keySignature", { length: 10 }),
  shortDescription: varchar("shortDescription", { length: 45 }),
});

export const arrangements = mysqlTable("arrangements", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  songId: char("songId", { length: 11 }),
  songDetailId: char("songDetailId", { length: 11 }),
  name: varchar("name", { length: 45 }),
  lyrics: text("lyrics"),
  freeShowId: varchar("freeShowId", { length: 45 }),
}, (t) => [
  index("ix_churchId_songId").on(t.churchId, t.songId),
]);

export const bibleBooks = mysqlTable("bibleBooks", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  translationKey: varchar("translationKey", { length: 45 }),
  keyName: varchar("keyName", { length: 45 }),
  abbreviation: varchar("abbreviation", { length: 45 }),
  name: varchar("name", { length: 45 }),
  sort: int("sort"),
}, (t) => [
  index("ix_translationKey").on(t.translationKey),
]);

export const bibleChapters = mysqlTable("bibleChapters", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  translationKey: varchar("translationKey", { length: 45 }),
  bookKey: varchar("bookKey", { length: 45 }),
  keyName: varchar("keyName", { length: 45 }),
  number: int("number"),
}, (t) => [
  index("ix_translationKey_bookKey").on(t.translationKey, t.bookKey),
]);

export const bibleLookups = mysqlTable("bibleLookups", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  translationKey: varchar("translationKey", { length: 45 }),
  lookupTime: datetime("lookupTime"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  startVerseKey: varchar("startVerseKey", { length: 15 }),
  endVerseKey: varchar("endVerseKey", { length: 15 }),
});

export const bibleTranslations = mysqlTable("bibleTranslations", {
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
  attributionString: varchar("attributionString", { length: 1000 }),
});

export const bibleVerses = mysqlTable("bibleVerses", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  translationKey: varchar("translationKey", { length: 45 }),
  chapterKey: varchar("chapterKey", { length: 45 }),
  keyName: varchar("keyName", { length: 45 }),
  number: int("number"),
}, (t) => [
  index("ix_translationKey_chapterKey").on(t.translationKey, t.chapterKey),
]);

export const bibleVerseTexts = mysqlTable("bibleVerseTexts", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  translationKey: varchar("translationKey", { length: 45 }),
  verseKey: varchar("verseKey", { length: 45 }),
  bookKey: varchar("bookKey", { length: 45 }),
  chapterNumber: int("chapterNumber"),
  verseNumber: int("verseNumber"),
  content: varchar("content", { length: 1000 }),
  newParagraph: boolean("newParagraph"),
}, (t) => [
  uniqueIndex("uq_translationKey_verseKey").on(t.translationKey, t.verseKey),
]);

export const blocks = mysqlTable("blocks", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  blockType: varchar("blockType", { length: 45 }),
  name: varchar("name", { length: 45 }),
});

export const curatedCalendars = mysqlTable("curatedCalendars", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 45 }),
});

export const curatedEvents = mysqlTable("curatedEvents", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  curatedCalendarId: char("curatedCalendarId", { length: 11 }),
  groupId: char("groupId", { length: 11 }),
  eventId: char("eventId", { length: 11 }),
}, (t) => [
  index("ix_churchId_curatedCalendarId").on(t.churchId, t.curatedCalendarId),
]);

export const elements = mysqlTable("elements", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  sectionId: char("sectionId", { length: 11 }),
  blockId: char("blockId", { length: 11 }),
  elementType: varchar("elementType", { length: 45 }),
  sort: float("sort"),
  parentId: char("parentId", { length: 11 }),
  answersJSON: mediumtext("answersJSON"),
  stylesJSON: mediumtext("stylesJSON"),
  animationsJSON: mediumtext("animationsJSON"),
}, (t) => [
  index("ix_churchId_blockId_sort").on(t.churchId, t.blockId, t.sort),
]);

export const eventExceptions = mysqlTable("eventExceptions", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  eventId: char("eventId", { length: 11 }),
  exceptionDate: datetime("exceptionDate"),
  recurrenceDate: datetime("recurrenceDate"),
});

export const events = mysqlTable("events", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  groupId: char("groupId", { length: 11 }),
  allDay: boolean("allDay"),
  start: datetime("start"),
  end: datetime("end"),
  title: varchar("title", { length: 255 }),
  description: mediumtext("description"),
  visibility: varchar("visibility", { length: 45 }),
  recurrenceRule: varchar("recurrenceRule", { length: 255 }),
  registrationEnabled: boolean("registrationEnabled"),
  capacity: int("capacity"),
  registrationOpenDate: datetime("registrationOpenDate"),
  registrationCloseDate: datetime("registrationCloseDate"),
  tags: varchar("tags", { length: 500 }),
  formId: char("formId", { length: 11 }),
}, (t) => [
  index("ix_churchId_groupId").on(t.churchId, t.groupId),
]);

export const files = mysqlTable("files", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  contentType: varchar("contentType", { length: 45 }),
  contentId: char("contentId", { length: 11 }),
  fileName: varchar("fileName", { length: 255 }),
  contentPath: varchar("contentPath", { length: 1024 }),
  fileType: varchar("fileType", { length: 45 }),
  size: int("size"),
  dateModified: datetime("dateModified"),
}, (t) => [
  index("ix_churchId_id").on(t.churchId, t.id),
]);

export const globalStyles = mysqlTable("globalStyles", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  fonts: text("fonts"),
  palette: text("palette"),
  typography: text("typography"),
  spacing: text("spacing"),
  borderRadius: text("borderRadius"),
  customCss: text("customCss"),
  customJS: text("customJS"),
});

export const links = mysqlTable("links", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  category: varchar("category", { length: 45 }),
  url: varchar("url", { length: 255 }),
  linkType: varchar("linkType", { length: 45 }),
  linkData: varchar("linkData", { length: 255 }),
  icon: varchar("icon", { length: 45 }),
  text: varchar("text", { length: 255 }),
  sort: float("sort"),
  photo: varchar("photo", { length: 255 }),
  parentId: char("parentId", { length: 11 }),
  visibility: varchar("visibility", { length: 45 }).default("everyone"),
  groupIds: text("groupIds"),
}, (t) => [
  index("churchId").on(t.churchId),
]);

export const pageHistory = mysqlTable("pageHistory", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  pageId: char("pageId", { length: 11 }),
  blockId: char("blockId", { length: 11 }),
  snapshotJSON: longtext("snapshotJSON"),
  description: varchar("description", { length: 200 }),
  userId: char("userId", { length: 11 }),
  createdDate: datetime("createdDate"),
}, (t) => [
  index("ix_pageId").on(t.pageId, t.createdDate),
  index("ix_blockId").on(t.blockId, t.createdDate),
]);

export const pages = mysqlTable("pages", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  url: varchar("url", { length: 255 }),
  title: varchar("title", { length: 255 }),
  layout: varchar("layout", { length: 45 }),
}, (t) => [
  uniqueIndex("uq_churchId_url").on(t.churchId, t.url),
]);

export const playlists = mysqlTable("playlists", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  publishDate: datetime("publishDate"),
  thumbnail: varchar("thumbnail", { length: 1024 }),
});

export const registrationMembers = mysqlTable("registrationMembers", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  registrationId: char("registrationId", { length: 11 }).notNull(),
  personId: char("personId", { length: 11 }),
  firstName: varchar("firstName", { length: 100 }),
  lastName: varchar("lastName", { length: 100 }),
}, (t) => [
  index("ix_regMembers_registrationId").on(t.registrationId),
  index("ix_regMembers_personId").on(t.personId),
]);

export const registrations = mysqlTable("registrations", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }).notNull(),
  eventId: char("eventId", { length: 11 }).notNull(),
  personId: char("personId", { length: 11 }),
  householdId: char("householdId", { length: 11 }),
  status: varchar("status", { length: 20 }).default("pending"),
  formSubmissionId: char("formSubmissionId", { length: 11 }),
  notes: mediumtext("notes"),
  registeredDate: datetime("registeredDate"),
  cancelledDate: datetime("cancelledDate"),
}, (t) => [
  index("ix_registrations_churchId_eventId").on(t.churchId, t.eventId),
  index("ix_registrations_personId").on(t.personId),
  index("ix_registrations_householdId").on(t.householdId),
]);

export const sections = mysqlTable("sections", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  pageId: char("pageId", { length: 11 }),
  blockId: char("blockId", { length: 11 }),
  zone: varchar("zone", { length: 45 }),
  background: varchar("background", { length: 255 }),
  textColor: varchar("textColor", { length: 45 }),
  headingColor: varchar("headingColor", { length: 45 }),
  linkColor: varchar("linkColor", { length: 45 }),
  sort: float("sort"),
  targetBlockId: char("targetBlockId", { length: 11 }),
  answersJSON: mediumtext("answersJSON"),
  stylesJSON: mediumtext("stylesJSON"),
  animationsJSON: mediumtext("animationsJSON"),
}, (t) => [
  index("ix_churchId_pageId_sort").on(t.churchId, t.pageId, t.sort),
  index("ix_churchId_blockId_sort").on(t.churchId, t.blockId, t.sort),
]);

export const sermons = mysqlTable("sermons", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  playlistId: char("playlistId", { length: 11 }),
  videoType: varchar("videoType", { length: 45 }),
  videoData: varchar("videoData", { length: 255 }),
  videoUrl: varchar("videoUrl", { length: 1024 }),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  publishDate: datetime("publishDate"),
  thumbnail: varchar("thumbnail", { length: 1024 }),
  duration: int("duration"),
  permanentUrl: boolean("permanentUrl"),
});

export const contentSettings = mysqlTable("settings", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  userId: char("userId", { length: 11 }),
  keyName: varchar("keyName", { length: 255 }),
  value: mediumtext("value"),
  public: boolean("public"),
}, (t) => [
  index("churchId").on(t.churchId),
  index("ix_churchId_keyName_userId").on(t.churchId, t.keyName, t.userId),
]);

export const songDetailLinks = mysqlTable("songDetailLinks", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  songDetailId: char("songDetailId", { length: 11 }),
  service: varchar("service", { length: 45 }),
  serviceKey: varchar("serviceKey", { length: 255 }),
  url: varchar("url", { length: 255 }),
});

export const songDetails = mysqlTable("songDetails", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  praiseChartsId: varchar("praiseChartsId", { length: 45 }),
  musicBrainzId: varchar("musicBrainzId", { length: 45 }),
  title: varchar("title", { length: 45 }),
  artist: varchar("artist", { length: 45 }),
  album: varchar("album", { length: 45 }),
  language: varchar("language", { length: 5 }),
  thumbnail: varchar("thumbnail", { length: 255 }),
  releaseDate: date("releaseDate"),
  bpm: int("bpm"),
  keySignature: varchar("keySignature", { length: 5 }),
  seconds: int("seconds"),
  meter: varchar("meter", { length: 10 }),
  tones: varchar("tones", { length: 45 }),
});

export const songs = mysqlTable("songs", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  name: varchar("name", { length: 45 }),
  dateAdded: date("dateAdded"),
}, (t) => [
  index("ix_churchId_name").on(t.churchId, t.name),
]);

export const streamingServices = mysqlTable("streamingServices", {
  id: char("id", { length: 11 }).notNull().primaryKey(),
  churchId: char("churchId", { length: 11 }),
  serviceTime: datetime("serviceTime"),
  earlyStart: int("earlyStart"),
  chatBefore: int("chatBefore"),
  chatAfter: int("chatAfter"),
  provider: varchar("provider", { length: 45 }),
  providerKey: varchar("providerKey", { length: 255 }),
  videoUrl: varchar("videoUrl", { length: 5000 }),
  timezoneOffset: int("timezoneOffset"),
  recurring: boolean("recurring"),
  label: varchar("label", { length: 255 }),
  sermonId: char("sermonId", { length: 11 }),
});
