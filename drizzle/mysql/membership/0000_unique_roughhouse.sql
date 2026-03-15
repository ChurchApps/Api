CREATE TABLE `accessLogs` (
	`id` char(11) NOT NULL,
	`userId` char(11),
	`churchId` char(11),
	`appName` varchar(45),
	`loginTime` datetime,
	CONSTRAINT `accessLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `answers` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`formSubmissionId` char(11),
	`questionId` char(11),
	`value` varchar(4000),
	CONSTRAINT `answers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditLogs` (
	`id` char(11) NOT NULL,
	`churchId` char(11) NOT NULL,
	`userId` char(11),
	`category` varchar(50) NOT NULL,
	`action` varchar(100) NOT NULL,
	`entityType` varchar(100),
	`entityId` char(11),
	`details` text,
	`ipAddress` varchar(45),
	`created` datetime NOT NULL,
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `churches` (
	`id` char(11) NOT NULL,
	`name` varchar(255),
	`subDomain` varchar(45),
	`registrationDate` datetime,
	`address1` varchar(255),
	`address2` varchar(255),
	`city` varchar(255),
	`state` varchar(45),
	`zip` varchar(45),
	`country` varchar(45),
	`archivedDate` datetime,
	`latitude` float,
	`longitude` float,
	CONSTRAINT `churches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clientErrors` (
	`id` char(11) NOT NULL,
	`application` varchar(45),
	`errorTime` datetime,
	`userId` char(11),
	`churchId` char(11),
	`originUrl` varchar(255),
	`errorType` varchar(45),
	`message` varchar(255),
	`details` text,
	CONSTRAINT `clientErrors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `domains` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`domainName` varchar(255),
	`lastChecked` datetime,
	`isStale` tinyint DEFAULT 0,
	CONSTRAINT `domains_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `formSubmissions` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`formId` char(11),
	`contentType` varchar(50),
	`contentId` char(11),
	`submissionDate` datetime,
	`submittedBy` char(11),
	`revisionDate` datetime,
	`revisedBy` char(11),
	CONSTRAINT `formSubmissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `forms` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`name` varchar(255),
	`contentType` varchar(50),
	`createdTime` datetime,
	`modifiedTime` datetime,
	`accessStartTime` datetime,
	`accessEndTime` datetime,
	`restricted` boolean,
	`archived` boolean,
	`removed` boolean,
	`thankYouMessage` text,
	CONSTRAINT `forms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `groupMembers` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`groupId` char(11),
	`personId` char(11),
	`joinDate` datetime,
	`leader` boolean,
	CONSTRAINT `groupMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`categoryName` varchar(50),
	`name` varchar(50),
	`trackAttendance` boolean,
	`parentPickup` boolean,
	`printNametag` boolean,
	`about` text,
	`photoUrl` varchar(255),
	`removed` boolean,
	`tags` varchar(45),
	`meetingTime` varchar(45),
	`meetingLocation` varchar(45),
	`labels` varchar(500),
	`slug` varchar(45),
	CONSTRAINT `groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`name` varchar(50),
	CONSTRAINT `households_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `memberPermissions` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`memberId` char(11),
	`contentType` varchar(45),
	`contentId` char(11),
	`action` varchar(45),
	`emailNotification` boolean,
	CONSTRAINT `memberPermissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`contentType` varchar(50),
	`contentId` char(11),
	`noteType` varchar(50),
	`addedBy` char(11),
	`createdAt` datetime,
	`contents` text,
	`updatedAt` datetime,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
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
CREATE TABLE `oAuthClients` (
	`id` char(11) NOT NULL,
	`name` varchar(45),
	`clientId` varchar(45),
	`clientSecret` varchar(45),
	`redirectUris` varchar(255),
	`scopes` varchar(255),
	`createdAt` datetime,
	CONSTRAINT `oAuthClients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `oAuthCodes` (
	`id` char(11) NOT NULL,
	`userChurchId` char(11),
	`clientId` char(11),
	`code` varchar(45),
	`redirectUri` varchar(255),
	`scopes` varchar(255),
	`expiresAt` datetime,
	`createdAt` datetime,
	CONSTRAINT `oAuthCodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `oAuthDeviceCodes` (
	`id` char(11) NOT NULL,
	`deviceCode` varchar(64) NOT NULL,
	`userCode` varchar(16) NOT NULL,
	`clientId` varchar(45) NOT NULL,
	`scopes` varchar(255),
	`expiresAt` datetime NOT NULL,
	`pollInterval` int DEFAULT 5,
	`status` enum('pending','approved','denied','expired') DEFAULT 'pending',
	`approvedByUserId` char(11),
	`userChurchId` char(11),
	`churchId` char(11),
	`createdAt` datetime,
	CONSTRAINT `oAuthDeviceCodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `deviceCode` UNIQUE(`deviceCode`)
);
--> statement-breakpoint
CREATE TABLE `oAuthRelaySessions` (
	`id` char(11) NOT NULL,
	`sessionCode` varchar(16) NOT NULL,
	`provider` varchar(45) NOT NULL,
	`authCode` varchar(512),
	`redirectUri` varchar(512) NOT NULL,
	`status` enum('pending','completed','expired') DEFAULT 'pending',
	`expiresAt` datetime NOT NULL,
	`createdAt` datetime,
	CONSTRAINT `oAuthRelaySessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessionCode` UNIQUE(`sessionCode`)
);
--> statement-breakpoint
CREATE TABLE `oAuthTokens` (
	`id` char(11) NOT NULL,
	`clientId` char(11),
	`userChurchId` char(11),
	`accessToken` varchar(1000),
	`refreshToken` varchar(45),
	`scopes` varchar(45),
	`expiresAt` datetime,
	`createdAt` datetime,
	CONSTRAINT `oAuthTokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`userId` char(11),
	`displayName` varchar(100),
	`firstName` varchar(50),
	`middleName` varchar(50),
	`lastName` varchar(50),
	`nickName` varchar(50),
	`prefix` varchar(10),
	`suffix` varchar(10),
	`birthDate` datetime,
	`gender` varchar(11),
	`maritalStatus` varchar(10),
	`anniversary` datetime,
	`membershipStatus` varchar(50),
	`homePhone` varchar(21),
	`mobilePhone` varchar(21),
	`workPhone` varchar(21),
	`email` varchar(100),
	`address1` varchar(50),
	`address2` varchar(50),
	`city` varchar(30),
	`state` varchar(10),
	`zip` varchar(10),
	`photoUpdated` datetime,
	`householdId` char(11),
	`householdRole` varchar(10),
	`removed` boolean,
	`conversationId` char(11),
	`optedOut` boolean,
	`nametagNotes` varchar(20),
	`donorNumber` varchar(20),
	CONSTRAINT `people_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`formId` char(11),
	`parentId` char(11),
	`title` varchar(255),
	`description` varchar(255),
	`fieldType` varchar(50),
	`placeholder` varchar(50),
	`sort` int,
	`choices` text,
	`removed` boolean,
	`required` boolean,
	CONSTRAINT `questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `roleMembers` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`roleId` char(11),
	`userId` char(11),
	`dateAdded` datetime,
	`addedBy` char(11),
	CONSTRAINT `roleMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rolePermissions` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`roleId` char(11),
	`apiName` varchar(45),
	`contentType` varchar(45),
	`contentId` char(11),
	`action` varchar(45),
	CONSTRAINT `rolePermissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`name` varchar(255),
	CONSTRAINT `roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `usageTrends` (
	`id` char(11) NOT NULL,
	`year` int,
	`week` int,
	`b1Users` int,
	`b1Churches` int,
	`b1Devices` int,
	`chumsUsers` int,
	`chumsChurches` int,
	`lessonsUsers` int,
	`lessonsChurches` int,
	`lessonsDevices` int,
	`freeShowDevices` int,
	CONSTRAINT `usageTrends_id` PRIMARY KEY(`id`),
	CONSTRAINT `year_week` UNIQUE(`year`,`week`)
);
--> statement-breakpoint
CREATE TABLE `userChurches` (
	`id` char(11) NOT NULL,
	`userId` char(11),
	`churchId` char(11),
	`personId` char(11),
	`lastAccessed` datetime,
	CONSTRAINT `userChurches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(11) NOT NULL,
	`email` varchar(191),
	`password` varchar(255),
	`authGuid` varchar(255),
	`displayName` varchar(255),
	`registrationDate` datetime,
	`lastLogin` datetime,
	`firstName` varchar(45),
	`lastName` varchar(45),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_UNIQUE` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `visibilityPreferences` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`personId` char(11),
	`address` varchar(50),
	`phoneNumber` varchar(50),
	`email` varchar(50),
	CONSTRAINT `visibilityPreferences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `churchId` ON `answers` (`churchId`);--> statement-breakpoint
CREATE INDEX `formSubmissionId` ON `answers` (`formSubmissionId`);--> statement-breakpoint
CREATE INDEX `questionId` ON `answers` (`questionId`);--> statement-breakpoint
CREATE INDEX `ix_auditLogs_church_created` ON `auditLogs` (`churchId`,`created`);--> statement-breakpoint
CREATE INDEX `ix_auditLogs_church_category` ON `auditLogs` (`churchId`,`category`);--> statement-breakpoint
CREATE INDEX `ix_auditLogs_church_userId` ON `auditLogs` (`churchId`,`userId`);--> statement-breakpoint
CREATE INDEX `ix_auditLogs_church_entity` ON `auditLogs` (`churchId`,`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `formSubmissions` (`churchId`);--> statement-breakpoint
CREATE INDEX `formId` ON `formSubmissions` (`formId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `forms` (`churchId`);--> statement-breakpoint
CREATE INDEX `churchId_removed_archived` ON `forms` (`churchId`,`removed`,`archived`);--> statement-breakpoint
CREATE INDEX `churchId_id` ON `forms` (`churchId`,`id`);--> statement-breakpoint
CREATE INDEX `churchId` ON `groupMembers` (`churchId`);--> statement-breakpoint
CREATE INDEX `groupId` ON `groupMembers` (`groupId`);--> statement-breakpoint
CREATE INDEX `personId` ON `groupMembers` (`personId`);--> statement-breakpoint
CREATE INDEX `churchId_groupId_personId` ON `groupMembers` (`churchId`,`groupId`,`personId`);--> statement-breakpoint
CREATE INDEX `personId_churchId` ON `groupMembers` (`personId`,`churchId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `groups` (`churchId`);--> statement-breakpoint
CREATE INDEX `churchId_removed_tags` ON `groups` (`churchId`,`removed`,`tags`);--> statement-breakpoint
CREATE INDEX `churchId_removed_labels` ON `groups` (`churchId`,`removed`,`labels`);--> statement-breakpoint
CREATE INDEX `churchId` ON `households` (`churchId`);--> statement-breakpoint
CREATE INDEX `churchId_contentId_memberId` ON `memberPermissions` (`churchId`,`contentId`,`memberId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `notes` (`churchId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `settings` (`churchId`);--> statement-breakpoint
CREATE INDEX `userCode_status` ON `oAuthDeviceCodes` (`userCode`,`status`);--> statement-breakpoint
CREATE INDEX `status_expiresAt` ON `oAuthDeviceCodes` (`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `status_expiresAt` ON `oAuthRelaySessions` (`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `churchId` ON `people` (`churchId`);--> statement-breakpoint
CREATE INDEX `userId` ON `people` (`userId`);--> statement-breakpoint
CREATE INDEX `householdId` ON `people` (`householdId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `questions` (`churchId`);--> statement-breakpoint
CREATE INDEX `formId` ON `questions` (`formId`);--> statement-breakpoint
CREATE INDEX `userId_INDEX` ON `roleMembers` (`userId`);--> statement-breakpoint
CREATE INDEX `userId_churchId` ON `roleMembers` (`userId`,`churchId`);--> statement-breakpoint
CREATE INDEX `roleId_churchId` ON `roleMembers` (`roleId`,`churchId`);--> statement-breakpoint
CREATE INDEX `roleId_churchId_INDEX` ON `rolePermissions` (`roleId`,`churchId`);--> statement-breakpoint
CREATE INDEX `userId` ON `userChurches` (`userId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `userChurches` (`churchId`);--> statement-breakpoint
CREATE INDEX `authGuid_INDEX` ON `users` (`authGuid`);