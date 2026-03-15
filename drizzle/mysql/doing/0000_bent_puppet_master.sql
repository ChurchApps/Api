CREATE TABLE `actions` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`automationId` char(11),
	`actionType` varchar(45),
	`actionData` mediumtext,
	CONSTRAINT `actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`positionId` char(11),
	`personId` char(11),
	`status` varchar(45),
	`notified` datetime,
	CONSTRAINT `assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automations` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`title` varchar(45),
	`recurs` varchar(45),
	`active` boolean,
	CONSTRAINT `automations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blockoutDates` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`personId` char(11),
	`startDate` date,
	`endDate` date,
	CONSTRAINT `blockoutDates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conditions` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`conjunctionId` char(11),
	`field` varchar(45),
	`fieldData` mediumtext,
	`operator` varchar(45),
	`value` varchar(45),
	`label` varchar(255),
	CONSTRAINT `conditions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conjunctions` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`automationId` char(11),
	`parentId` char(11),
	`groupType` varchar(45),
	CONSTRAINT `conjunctions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contentProviderAuths` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`ministryId` char(11),
	`providerId` varchar(50),
	`accessToken` text,
	`refreshToken` text,
	`tokenType` varchar(50),
	`expiresAt` datetime,
	`scope` varchar(255),
	CONSTRAINT `contentProviderAuths_id` PRIMARY KEY(`id`)
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
	`updatedAt` datetime,
	`contents` text,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `planItems` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`planId` char(11),
	`parentId` char(11),
	`sort` float,
	`itemType` varchar(45),
	`relatedId` char(11),
	`label` varchar(100),
	`description` varchar(1000),
	`seconds` int,
	`link` varchar(1000),
	`providerId` varchar(50),
	`providerPath` varchar(500),
	`providerContentPath` varchar(50),
	`thumbnailUrl` varchar(1024),
	CONSTRAINT `planItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `planTypes` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`ministryId` char(11),
	`name` varchar(255),
	CONSTRAINT `planTypes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`ministryId` char(11),
	`planTypeId` char(11),
	`name` varchar(45),
	`serviceDate` date,
	`notes` mediumtext,
	`serviceOrder` boolean,
	`contentType` varchar(50),
	`contentId` char(11),
	`providerId` varchar(50),
	`providerPlanId` varchar(100),
	`providerPlanName` varchar(255),
	`signupDeadlineHours` int,
	`showVolunteerNames` boolean,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`planId` char(11),
	`categoryName` varchar(45),
	`name` varchar(45),
	`count` int,
	`groupId` char(11),
	`allowSelfSignup` boolean,
	`description` text,
	CONSTRAINT `positions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`taskNumber` int,
	`taskType` varchar(45),
	`dateCreated` datetime,
	`dateClosed` datetime,
	`associatedWithType` varchar(45),
	`associatedWithId` char(11),
	`associatedWithLabel` varchar(45),
	`createdByType` varchar(45),
	`createdById` char(11),
	`createdByLabel` varchar(45),
	`assignedToType` varchar(45),
	`assignedToId` char(11),
	`assignedToLabel` varchar(45),
	`title` varchar(255),
	`status` varchar(45),
	`automationId` char(11),
	`conversationId` char(11),
	`data` text,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `times` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`planId` char(11),
	`displayName` varchar(45),
	`startTime` datetime,
	`endTime` datetime,
	`teams` varchar(1000),
	CONSTRAINT `times_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_church_person` ON `assignments` (`churchId`,`personId`);--> statement-breakpoint
CREATE INDEX `idx_position` ON `assignments` (`positionId`);--> statement-breakpoint
CREATE INDEX `idx_ministry_provider` ON `contentProviderAuths` (`churchId`,`ministryId`,`providerId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `notes` (`churchId`);--> statement-breakpoint
CREATE INDEX `idx_church_plan` ON `planItems` (`churchId`,`planId`);--> statement-breakpoint
CREATE INDEX `idx_parent` ON `planItems` (`parentId`);--> statement-breakpoint
CREATE INDEX `idx_church_plan` ON `positions` (`churchId`,`planId`);--> statement-breakpoint
CREATE INDEX `idx_group` ON `positions` (`groupId`);--> statement-breakpoint
CREATE INDEX `idx_church_status` ON `tasks` (`churchId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_automation` ON `tasks` (`churchId`,`automationId`);--> statement-breakpoint
CREATE INDEX `idx_assigned` ON `tasks` (`churchId`,`assignedToType`,`assignedToId`);--> statement-breakpoint
CREATE INDEX `idx_created` ON `tasks` (`churchId`,`createdByType`,`createdById`);