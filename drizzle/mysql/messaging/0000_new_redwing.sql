CREATE TABLE `blockedIps` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`conversationId` char(11),
	`serviceId` char(11),
	`ipAddress` varchar(45),
	CONSTRAINT `blockedIps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `connections` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`conversationId` char(11),
	`personId` char(11),
	`displayName` varchar(45),
	`timeJoined` datetime,
	`socketId` varchar(45),
	`ipAddress` varchar(45),
	CONSTRAINT `connections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`contentType` varchar(45),
	`contentId` varchar(255),
	`title` varchar(255),
	`dateCreated` datetime,
	`groupId` char(11),
	`visibility` varchar(45),
	`firstPostId` char(11),
	`lastPostId` char(11),
	`postCount` int,
	`allowAnonymousPosts` boolean,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deliveryLogs` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`personId` char(11),
	`contentType` varchar(20),
	`contentId` char(11),
	`deliveryMethod` varchar(10),
	`success` boolean,
	`errorMessage` varchar(500),
	`deliveryAddress` varchar(255),
	`attemptTime` datetime,
	CONSTRAINT `deliveryLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deviceContents` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`deviceId` char(11),
	`contentType` varchar(45),
	`contentId` char(11),
	CONSTRAINT `deviceContents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` char(11) NOT NULL,
	`appName` varchar(20),
	`deviceId` varchar(45),
	`churchId` char(11),
	`personId` char(11),
	`fcmToken` varchar(255),
	`label` varchar(45),
	`registrationDate` datetime,
	`lastActiveDate` datetime,
	`deviceInfo` text,
	`admId` varchar(255),
	`pairingCode` varchar(45),
	`ipAddress` varchar(45),
	`contentType` varchar(45),
	`contentId` char(11),
	CONSTRAINT `devices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `emailTemplates` (
	`id` char(11) NOT NULL,
	`churchId` char(11) NOT NULL,
	`name` varchar(255) NOT NULL,
	`subject` varchar(500) NOT NULL,
	`htmlContent` text NOT NULL,
	`category` varchar(100),
	`dateCreated` datetime,
	`dateModified` datetime,
	CONSTRAINT `emailTemplates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`conversationId` char(11),
	`displayName` varchar(45),
	`timeSent` datetime,
	`messageType` varchar(45),
	`content` text,
	`personId` char(11),
	`timeUpdated` datetime,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notificationPreferences` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`personId` char(11),
	`allowPush` boolean,
	`emailFrequency` varchar(10),
	CONSTRAINT `notificationPreferences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`personId` char(11),
	`contentType` varchar(45),
	`contentId` char(11),
	`timeSent` datetime,
	`isNew` boolean,
	`message` text,
	`link` varchar(100),
	`deliveryMethod` varchar(10),
	`triggeredByPersonId` char(11),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `privateMessages` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`fromPersonId` char(11),
	`toPersonId` char(11),
	`conversationId` char(11),
	`notifyPersonId` char(11),
	`deliveryMethod` varchar(10),
	CONSTRAINT `privateMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sentTexts` (
	`id` char(11) NOT NULL,
	`churchId` char(11) NOT NULL,
	`groupId` char(11),
	`recipientPersonId` char(11),
	`senderPersonId` char(11),
	`message` varchar(1600),
	`recipientCount` int DEFAULT 0,
	`successCount` int DEFAULT 0,
	`failCount` int DEFAULT 0,
	`timeSent` datetime,
	CONSTRAINT `sentTexts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `textingProviders` (
	`id` char(11) NOT NULL,
	`churchId` char(11) NOT NULL,
	`provider` varchar(50) NOT NULL,
	`apiKey` varchar(500),
	`apiSecret` varchar(500),
	`fromNumber` varchar(20),
	`enabled` boolean,
	CONSTRAINT `textingProviders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ix_churchId` ON `connections` (`churchId`,`conversationId`);--> statement-breakpoint
CREATE INDEX `ix_churchId` ON `conversations` (`churchId`,`contentType`,`contentId`);--> statement-breakpoint
CREATE INDEX `ix_content` ON `deliveryLogs` (`contentType`,`contentId`);--> statement-breakpoint
CREATE INDEX `ix_personId` ON `deliveryLogs` (`personId`,`attemptTime`);--> statement-breakpoint
CREATE INDEX `ix_churchId_time` ON `deliveryLogs` (`churchId`,`attemptTime`);--> statement-breakpoint
CREATE INDEX `appName_deviceId` ON `devices` (`appName`,`deviceId`);--> statement-breakpoint
CREATE INDEX `personId_lastActiveDate` ON `devices` (`personId`,`lastActiveDate`);--> statement-breakpoint
CREATE INDEX `fcmToken` ON `devices` (`fcmToken`);--> statement-breakpoint
CREATE INDEX `pairingCode` ON `devices` (`pairingCode`);--> statement-breakpoint
CREATE INDEX `ix_churchId` ON `emailTemplates` (`churchId`);--> statement-breakpoint
CREATE INDEX `ix_churchId` ON `messages` (`churchId`,`conversationId`);--> statement-breakpoint
CREATE INDEX `ix_timeSent` ON `messages` (`timeSent`);--> statement-breakpoint
CREATE INDEX `ix_personId` ON `messages` (`personId`);--> statement-breakpoint
CREATE INDEX `churchId_personId_timeSent` ON `notifications` (`churchId`,`personId`,`timeSent`);--> statement-breakpoint
CREATE INDEX `isNew` ON `notifications` (`isNew`);--> statement-breakpoint
CREATE INDEX `IX_churchFrom` ON `privateMessages` (`churchId`,`fromPersonId`);--> statement-breakpoint
CREATE INDEX `IX_churchTo` ON `privateMessages` (`churchId`,`toPersonId`);--> statement-breakpoint
CREATE INDEX `IX_notifyPersonId` ON `privateMessages` (`churchId`,`notifyPersonId`);--> statement-breakpoint
CREATE INDEX `IX_conversationId` ON `privateMessages` (`conversationId`);--> statement-breakpoint
CREATE INDEX `ix_churchId` ON `sentTexts` (`churchId`,`timeSent`);--> statement-breakpoint
CREATE INDEX `ix_churchId` ON `textingProviders` (`churchId`);