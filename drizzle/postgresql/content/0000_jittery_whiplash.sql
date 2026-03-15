CREATE TABLE "arrangementKeys" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"arrangementId" char(11),
	"keySignature" varchar(10),
	"shortDescription" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "arrangements" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"songId" char(11),
	"songDetailId" char(11),
	"name" varchar(45),
	"lyrics" text,
	"freeShowId" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "bibleBooks" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"translationKey" varchar(45),
	"keyName" varchar(45),
	"abbreviation" varchar(45),
	"name" varchar(45),
	"sort" integer
);
--> statement-breakpoint
CREATE TABLE "bibleChapters" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"translationKey" varchar(45),
	"bookKey" varchar(45),
	"keyName" varchar(45),
	"number" integer
);
--> statement-breakpoint
CREATE TABLE "bibleLookups" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"translationKey" varchar(45),
	"lookupTime" timestamp,
	"ipAddress" varchar(45),
	"startVerseKey" varchar(15),
	"endVerseKey" varchar(15)
);
--> statement-breakpoint
CREATE TABLE "bibleTranslations" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"abbreviation" varchar(10),
	"name" varchar(255),
	"nameLocal" varchar(255),
	"description" varchar(1000),
	"source" varchar(45),
	"sourceKey" varchar(45),
	"language" varchar(45),
	"countries" varchar(255),
	"copyright" varchar(1000),
	"attributionRequired" boolean,
	"attributionString" varchar(1000)
);
--> statement-breakpoint
CREATE TABLE "bibleVerseTexts" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"translationKey" varchar(45),
	"verseKey" varchar(45),
	"bookKey" varchar(45),
	"chapterNumber" integer,
	"verseNumber" integer,
	"content" varchar(1000),
	"newParagraph" boolean
);
--> statement-breakpoint
CREATE TABLE "bibleVerses" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"translationKey" varchar(45),
	"chapterKey" varchar(45),
	"keyName" varchar(45),
	"number" integer
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"blockType" varchar(45),
	"name" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"userId" char(11),
	"keyName" varchar(255),
	"value" text,
	"public" boolean
);
--> statement-breakpoint
CREATE TABLE "curatedCalendars" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"name" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "curatedEvents" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"curatedCalendarId" char(11),
	"groupId" char(11),
	"eventId" char(11)
);
--> statement-breakpoint
CREATE TABLE "elements" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"sectionId" char(11),
	"blockId" char(11),
	"elementType" varchar(45),
	"sort" real,
	"parentId" char(11),
	"answersJSON" text,
	"stylesJSON" text,
	"animationsJSON" text
);
--> statement-breakpoint
CREATE TABLE "eventExceptions" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"eventId" char(11),
	"exceptionDate" timestamp,
	"recurrenceDate" timestamp
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"groupId" char(11),
	"allDay" boolean,
	"start" timestamp,
	"end" timestamp,
	"title" varchar(255),
	"description" text,
	"visibility" varchar(45),
	"recurrenceRule" varchar(255),
	"registrationEnabled" boolean,
	"capacity" integer,
	"registrationOpenDate" timestamp,
	"registrationCloseDate" timestamp,
	"tags" varchar(500),
	"formId" char(11)
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"contentType" varchar(45),
	"contentId" char(11),
	"fileName" varchar(255),
	"contentPath" varchar(1024),
	"fileType" varchar(45),
	"size" integer,
	"dateModified" timestamp
);
--> statement-breakpoint
CREATE TABLE "globalStyles" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"fonts" text,
	"palette" text,
	"typography" text,
	"spacing" text,
	"borderRadius" text,
	"customCss" text,
	"customJS" text
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"category" varchar(45),
	"url" varchar(255),
	"linkType" varchar(45),
	"linkData" varchar(255),
	"icon" varchar(45),
	"text" varchar(255),
	"sort" real,
	"photo" varchar(255),
	"parentId" char(11),
	"visibility" varchar(45) DEFAULT 'everyone',
	"groupIds" text
);
--> statement-breakpoint
CREATE TABLE "pageHistory" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"pageId" char(11),
	"blockId" char(11),
	"snapshotJSON" text,
	"description" varchar(200),
	"userId" char(11),
	"createdDate" timestamp
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"url" varchar(255),
	"title" varchar(255),
	"layout" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"title" varchar(255),
	"description" text,
	"publishDate" timestamp,
	"thumbnail" varchar(1024)
);
--> statement-breakpoint
CREATE TABLE "registrationMembers" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11) NOT NULL,
	"registrationId" char(11) NOT NULL,
	"personId" char(11),
	"firstName" varchar(100),
	"lastName" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11) NOT NULL,
	"eventId" char(11) NOT NULL,
	"personId" char(11),
	"householdId" char(11),
	"status" varchar(20) DEFAULT 'pending',
	"formSubmissionId" char(11),
	"notes" text,
	"registeredDate" timestamp,
	"cancelledDate" timestamp
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"pageId" char(11),
	"blockId" char(11),
	"zone" varchar(45),
	"background" varchar(255),
	"textColor" varchar(45),
	"headingColor" varchar(45),
	"linkColor" varchar(45),
	"sort" real,
	"targetBlockId" char(11),
	"answersJSON" text,
	"stylesJSON" text,
	"animationsJSON" text
);
--> statement-breakpoint
CREATE TABLE "sermons" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"playlistId" char(11),
	"videoType" varchar(45),
	"videoData" varchar(255),
	"videoUrl" varchar(1024),
	"title" varchar(255),
	"description" text,
	"publishDate" timestamp,
	"thumbnail" varchar(1024),
	"duration" integer,
	"permanentUrl" boolean
);
--> statement-breakpoint
CREATE TABLE "songDetailLinks" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"songDetailId" char(11),
	"service" varchar(45),
	"serviceKey" varchar(255),
	"url" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "songDetails" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"praiseChartsId" varchar(45),
	"musicBrainzId" varchar(45),
	"title" varchar(45),
	"artist" varchar(45),
	"album" varchar(45),
	"language" varchar(5),
	"thumbnail" varchar(255),
	"releaseDate" date,
	"bpm" integer,
	"keySignature" varchar(5),
	"seconds" integer,
	"meter" varchar(10),
	"tones" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"name" varchar(45),
	"dateAdded" date
);
--> statement-breakpoint
CREATE TABLE "streamingServices" (
	"id" char(11) PRIMARY KEY NOT NULL,
	"churchId" char(11),
	"serviceTime" timestamp,
	"earlyStart" integer,
	"chatBefore" integer,
	"chatAfter" integer,
	"provider" varchar(45),
	"providerKey" varchar(255),
	"videoUrl" varchar(5000),
	"timezoneOffset" integer,
	"recurring" boolean,
	"label" varchar(255),
	"sermonId" char(11)
);
--> statement-breakpoint
CREATE INDEX "cnt_ix_churchId_songId" ON "arrangements" USING btree ("churchId","songId");--> statement-breakpoint
CREATE INDEX "cnt_ix_translationKey" ON "bibleBooks" USING btree ("translationKey");--> statement-breakpoint
CREATE INDEX "cnt_ix_translationKey_bookKey" ON "bibleChapters" USING btree ("translationKey","bookKey");--> statement-breakpoint
CREATE UNIQUE INDEX "cnt_uq_translationKey_verseKey" ON "bibleVerseTexts" USING btree ("translationKey","verseKey");--> statement-breakpoint
CREATE INDEX "cnt_ix_translationKey_chapterKey" ON "bibleVerses" USING btree ("translationKey","chapterKey");--> statement-breakpoint
CREATE INDEX "cnt_settings_churchId" ON "settings" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "cnt_ix_churchId_keyName_userId" ON "settings" USING btree ("churchId","keyName","userId");--> statement-breakpoint
CREATE INDEX "cnt_ix_churchId_curatedCalendarId" ON "curatedEvents" USING btree ("churchId","curatedCalendarId");--> statement-breakpoint
CREATE INDEX "cnt_ix_churchId_blockId_sort" ON "elements" USING btree ("churchId","blockId","sort");--> statement-breakpoint
CREATE INDEX "cnt_ix_churchId_groupId" ON "events" USING btree ("churchId","groupId");--> statement-breakpoint
CREATE INDEX "cnt_ix_churchId_id" ON "files" USING btree ("churchId","id");--> statement-breakpoint
CREATE INDEX "cnt_links_churchId" ON "links" USING btree ("churchId");--> statement-breakpoint
CREATE INDEX "cnt_ix_pageId" ON "pageHistory" USING btree ("pageId","createdDate");--> statement-breakpoint
CREATE INDEX "cnt_ix_blockId" ON "pageHistory" USING btree ("blockId","createdDate");--> statement-breakpoint
CREATE UNIQUE INDEX "cnt_uq_churchId_url" ON "pages" USING btree ("churchId","url");--> statement-breakpoint
CREATE INDEX "cnt_ix_regMembers_registrationId" ON "registrationMembers" USING btree ("registrationId");--> statement-breakpoint
CREATE INDEX "cnt_ix_regMembers_personId" ON "registrationMembers" USING btree ("personId");--> statement-breakpoint
CREATE INDEX "cnt_ix_registrations_churchId_eventId" ON "registrations" USING btree ("churchId","eventId");--> statement-breakpoint
CREATE INDEX "cnt_ix_registrations_personId" ON "registrations" USING btree ("personId");--> statement-breakpoint
CREATE INDEX "cnt_ix_registrations_householdId" ON "registrations" USING btree ("householdId");--> statement-breakpoint
CREATE INDEX "cnt_ix_sections_churchId_pageId_sort" ON "sections" USING btree ("churchId","pageId","sort");--> statement-breakpoint
CREATE INDEX "cnt_ix_sections_churchId_blockId_sort" ON "sections" USING btree ("churchId","blockId","sort");--> statement-breakpoint
CREATE INDEX "cnt_ix_churchId_name" ON "songs" USING btree ("churchId","name");