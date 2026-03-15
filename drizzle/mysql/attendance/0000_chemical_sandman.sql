CREATE TABLE `settings` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`keyName` varchar(255),
	`value` varchar(255),
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campuses` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`name` varchar(255),
	`address1` varchar(50),
	`address2` varchar(50),
	`city` varchar(50),
	`state` varchar(10),
	`zip` varchar(10),
	`removed` boolean,
	CONSTRAINT `campuses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `groupServiceTimes` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`groupId` char(11),
	`serviceTimeId` char(11),
	CONSTRAINT `groupServiceTimes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `serviceTimes` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`serviceId` char(11),
	`name` varchar(50),
	`removed` boolean,
	CONSTRAINT `serviceTimes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`campusId` char(11),
	`name` varchar(50),
	`removed` boolean,
	CONSTRAINT `services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`groupId` char(11),
	`serviceTimeId` char(11),
	`sessionDate` datetime,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `visitSessions` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`visitId` char(11),
	`sessionId` char(11),
	CONSTRAINT `visitSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`personId` char(11),
	`serviceId` char(11),
	`groupId` char(11),
	`visitDate` datetime,
	`checkinTime` datetime,
	`addedBy` char(11),
	CONSTRAINT `visits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `churchId` ON `settings` (`churchId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `campuses` (`churchId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `groupServiceTimes` (`churchId`);--> statement-breakpoint
CREATE INDEX `groupId` ON `groupServiceTimes` (`groupId`);--> statement-breakpoint
CREATE INDEX `serviceTimeId` ON `groupServiceTimes` (`serviceTimeId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `serviceTimes` (`churchId`);--> statement-breakpoint
CREATE INDEX `serviceId` ON `serviceTimes` (`serviceId`);--> statement-breakpoint
CREATE INDEX `idx_church_service_removed` ON `serviceTimes` (`churchId`,`serviceId`,`removed`);--> statement-breakpoint
CREATE INDEX `churchId` ON `services` (`churchId`);--> statement-breakpoint
CREATE INDEX `campusId` ON `services` (`campusId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `sessions` (`churchId`);--> statement-breakpoint
CREATE INDEX `groupId` ON `sessions` (`groupId`);--> statement-breakpoint
CREATE INDEX `serviceTimeId` ON `sessions` (`serviceTimeId`);--> statement-breakpoint
CREATE INDEX `idx_church_session_date` ON `sessions` (`churchId`,`sessionDate`);--> statement-breakpoint
CREATE INDEX `idx_church_group_service` ON `sessions` (`churchId`,`groupId`,`serviceTimeId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `visitSessions` (`churchId`);--> statement-breakpoint
CREATE INDEX `visitId` ON `visitSessions` (`visitId`);--> statement-breakpoint
CREATE INDEX `sessionId` ON `visitSessions` (`sessionId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `visits` (`churchId`);--> statement-breakpoint
CREATE INDEX `personId` ON `visits` (`personId`);--> statement-breakpoint
CREATE INDEX `serviceId` ON `visits` (`serviceId`);--> statement-breakpoint
CREATE INDEX `groupId` ON `visits` (`groupId`);--> statement-breakpoint
CREATE INDEX `idx_church_visit_date` ON `visits` (`churchId`,`visitDate`);--> statement-breakpoint
CREATE INDEX `idx_church_person` ON `visits` (`churchId`,`personId`);