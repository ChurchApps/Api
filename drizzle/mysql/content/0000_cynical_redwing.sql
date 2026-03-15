CREATE TABLE `arrangementKeys` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`arrangementId` char(11),
	`keySignature` varchar(10),
	`shortDescription` varchar(45),
	CONSTRAINT `arrangementKeys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `arrangements` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`songId` char(11),
	`songDetailId` char(11),
	`name` varchar(45),
	`lyrics` text,
	`freeShowId` varchar(45),
	CONSTRAINT `arrangements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bibleBooks` (
	`id` char(11) NOT NULL,
	`translationKey` varchar(45),
	`keyName` varchar(45),
	`abbreviation` varchar(45),
	`name` varchar(45),
	`sort` int,
	CONSTRAINT `bibleBooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bibleChapters` (
	`id` char(11) NOT NULL,
	`translationKey` varchar(45),
	`bookKey` varchar(45),
	`keyName` varchar(45),
	`number` int,
	CONSTRAINT `bibleChapters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bibleLookups` (
	`id` char(11) NOT NULL,
	`translationKey` varchar(45),
	`lookupTime` datetime,
	`ipAddress` varchar(45),
	`startVerseKey` varchar(15),
	`endVerseKey` varchar(15),
	CONSTRAINT `bibleLookups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bibleTranslations` (
	`id` char(11) NOT NULL,
	`abbreviation` varchar(10),
	`name` varchar(255),
	`nameLocal` varchar(255),
	`description` varchar(1000),
	`source` varchar(45),
	`sourceKey` varchar(45),
	`language` varchar(45),
	`countries` varchar(255),
	`copyright` varchar(1000),
	`attributionRequired` boolean,
	`attributionString` varchar(1000),
	CONSTRAINT `bibleTranslations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bibleVerseTexts` (
	`id` char(11) NOT NULL,
	`translationKey` varchar(45),
	`verseKey` varchar(45),
	`bookKey` varchar(45),
	`chapterNumber` int,
	`verseNumber` int,
	`content` varchar(1000),
	`newParagraph` boolean,
	CONSTRAINT `bibleVerseTexts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_translationKey_verseKey` UNIQUE(`translationKey`,`verseKey`)
);
--> statement-breakpoint
CREATE TABLE `bibleVerses` (
	`id` char(11) NOT NULL,
	`translationKey` varchar(45),
	`chapterKey` varchar(45),
	`keyName` varchar(45),
	`number` int,
	CONSTRAINT `bibleVerses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`blockType` varchar(45),
	`name` varchar(45),
	CONSTRAINT `blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`userId` char(11),
	`keyName` varchar(255),
	`value` mediumtext,
	`public` boolean,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `curatedCalendars` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`name` varchar(45),
	CONSTRAINT `curatedCalendars_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `curatedEvents` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`curatedCalendarId` char(11),
	`groupId` char(11),
	`eventId` char(11),
	CONSTRAINT `curatedEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `elements` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`sectionId` char(11),
	`blockId` char(11),
	`elementType` varchar(45),
	`sort` float,
	`parentId` char(11),
	`answersJSON` mediumtext,
	`stylesJSON` mediumtext,
	`animationsJSON` mediumtext,
	CONSTRAINT `elements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `eventExceptions` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`eventId` char(11),
	`exceptionDate` datetime,
	`recurrenceDate` datetime,
	CONSTRAINT `eventExceptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`groupId` char(11),
	`allDay` boolean,
	`start` datetime,
	`end` datetime,
	`title` varchar(255),
	`description` mediumtext,
	`visibility` varchar(45),
	`recurrenceRule` varchar(255),
	`registrationEnabled` boolean,
	`capacity` int,
	`registrationOpenDate` datetime,
	`registrationCloseDate` datetime,
	`tags` varchar(500),
	`formId` char(11),
	CONSTRAINT `events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`contentType` varchar(45),
	`contentId` char(11),
	`fileName` varchar(255),
	`contentPath` varchar(1024),
	`fileType` varchar(45),
	`size` int,
	`dateModified` datetime,
	CONSTRAINT `files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `globalStyles` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`fonts` text,
	`palette` text,
	`typography` text,
	`spacing` text,
	`borderRadius` text,
	`customCss` text,
	`customJS` text,
	CONSTRAINT `globalStyles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `links` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`category` varchar(45),
	`url` varchar(255),
	`linkType` varchar(45),
	`linkData` varchar(255),
	`icon` varchar(45),
	`text` varchar(255),
	`sort` float,
	`photo` varchar(255),
	`parentId` char(11),
	`visibility` varchar(45) DEFAULT 'everyone',
	`groupIds` text,
	CONSTRAINT `links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pageHistory` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`pageId` char(11),
	`blockId` char(11),
	`snapshotJSON` longtext,
	`description` varchar(200),
	`userId` char(11),
	`createdDate` datetime,
	CONSTRAINT `pageHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`url` varchar(255),
	`title` varchar(255),
	`layout` varchar(45),
	CONSTRAINT `pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_churchId_url` UNIQUE(`churchId`,`url`)
);
--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`title` varchar(255),
	`description` text,
	`publishDate` datetime,
	`thumbnail` varchar(1024),
	CONSTRAINT `playlists_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `registrationMembers` (
	`id` char(11) NOT NULL,
	`churchId` char(11) NOT NULL,
	`registrationId` char(11) NOT NULL,
	`personId` char(11),
	`firstName` varchar(100),
	`lastName` varchar(100),
	CONSTRAINT `registrationMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `registrations` (
	`id` char(11) NOT NULL,
	`churchId` char(11) NOT NULL,
	`eventId` char(11) NOT NULL,
	`personId` char(11),
	`householdId` char(11),
	`status` varchar(20) DEFAULT 'pending',
	`formSubmissionId` char(11),
	`notes` mediumtext,
	`registeredDate` datetime,
	`cancelledDate` datetime,
	CONSTRAINT `registrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sections` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`pageId` char(11),
	`blockId` char(11),
	`zone` varchar(45),
	`background` varchar(255),
	`textColor` varchar(45),
	`headingColor` varchar(45),
	`linkColor` varchar(45),
	`sort` float,
	`targetBlockId` char(11),
	`answersJSON` mediumtext,
	`stylesJSON` mediumtext,
	`animationsJSON` mediumtext,
	CONSTRAINT `sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sermons` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`playlistId` char(11),
	`videoType` varchar(45),
	`videoData` varchar(255),
	`videoUrl` varchar(1024),
	`title` varchar(255),
	`description` text,
	`publishDate` datetime,
	`thumbnail` varchar(1024),
	`duration` int,
	`permanentUrl` boolean,
	CONSTRAINT `sermons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `songDetailLinks` (
	`id` char(11) NOT NULL,
	`songDetailId` char(11),
	`service` varchar(45),
	`serviceKey` varchar(255),
	`url` varchar(255),
	CONSTRAINT `songDetailLinks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `songDetails` (
	`id` char(11) NOT NULL,
	`praiseChartsId` varchar(45),
	`musicBrainzId` varchar(45),
	`title` varchar(45),
	`artist` varchar(45),
	`album` varchar(45),
	`language` varchar(5),
	`thumbnail` varchar(255),
	`releaseDate` date,
	`bpm` int,
	`keySignature` varchar(5),
	`seconds` int,
	`meter` varchar(10),
	`tones` varchar(45),
	CONSTRAINT `songDetails_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`name` varchar(45),
	`dateAdded` date,
	CONSTRAINT `songs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `streamingServices` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`serviceTime` datetime,
	`earlyStart` int,
	`chatBefore` int,
	`chatAfter` int,
	`provider` varchar(45),
	`providerKey` varchar(255),
	`videoUrl` varchar(5000),
	`timezoneOffset` int,
	`recurring` boolean,
	`label` varchar(255),
	`sermonId` char(11),
	CONSTRAINT `streamingServices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ix_churchId_songId` ON `arrangements` (`churchId`,`songId`);--> statement-breakpoint
CREATE INDEX `ix_translationKey` ON `bibleBooks` (`translationKey`);--> statement-breakpoint
CREATE INDEX `ix_translationKey_bookKey` ON `bibleChapters` (`translationKey`,`bookKey`);--> statement-breakpoint
CREATE INDEX `ix_translationKey_chapterKey` ON `bibleVerses` (`translationKey`,`chapterKey`);--> statement-breakpoint
CREATE INDEX `churchId` ON `settings` (`churchId`);--> statement-breakpoint
CREATE INDEX `ix_churchId_keyName_userId` ON `settings` (`churchId`,`keyName`,`userId`);--> statement-breakpoint
CREATE INDEX `ix_churchId_curatedCalendarId` ON `curatedEvents` (`churchId`,`curatedCalendarId`);--> statement-breakpoint
CREATE INDEX `ix_churchId_blockId_sort` ON `elements` (`churchId`,`blockId`,`sort`);--> statement-breakpoint
CREATE INDEX `ix_churchId_groupId` ON `events` (`churchId`,`groupId`);--> statement-breakpoint
CREATE INDEX `ix_churchId_id` ON `files` (`churchId`,`id`);--> statement-breakpoint
CREATE INDEX `churchId` ON `links` (`churchId`);--> statement-breakpoint
CREATE INDEX `ix_pageId` ON `pageHistory` (`pageId`,`createdDate`);--> statement-breakpoint
CREATE INDEX `ix_blockId` ON `pageHistory` (`blockId`,`createdDate`);--> statement-breakpoint
CREATE INDEX `ix_regMembers_registrationId` ON `registrationMembers` (`registrationId`);--> statement-breakpoint
CREATE INDEX `ix_regMembers_personId` ON `registrationMembers` (`personId`);--> statement-breakpoint
CREATE INDEX `ix_registrations_churchId_eventId` ON `registrations` (`churchId`,`eventId`);--> statement-breakpoint
CREATE INDEX `ix_registrations_personId` ON `registrations` (`personId`);--> statement-breakpoint
CREATE INDEX `ix_registrations_householdId` ON `registrations` (`householdId`);--> statement-breakpoint
CREATE INDEX `ix_sections_churchId_pageId_sort` ON `sections` (`churchId`,`pageId`,`sort`);--> statement-breakpoint
CREATE INDEX `ix_sections_churchId_blockId_sort` ON `sections` (`churchId`,`blockId`,`sort`);--> statement-breakpoint
CREATE INDEX `ix_churchId_name` ON `songs` (`churchId`,`name`);