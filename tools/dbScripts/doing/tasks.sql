DROP TABLE IF EXISTS `tasks`;

CREATE TABLE `tasks` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `taskNumber` int(11) DEFAULT NULL,
  `taskType` varchar(45) DEFAULT NULL,
  `dateCreated` datetime DEFAULT NULL,
  `dateClosed` datetime DEFAULT NULL,
  `associatedWithType` varchar(45) DEFAULT NULL,
  `associatedWithId` char(11) DEFAULT NULL,
  `associatedWithLabel` varchar(45) DEFAULT NULL,
  `createdByType` varchar(45) DEFAULT NULL,
  `createdById` char(11) DEFAULT NULL,
  `createdByLabel` varchar(45) DEFAULT NULL,
  `assignedToType` varchar(45) DEFAULT NULL,
  `assignedToId` char(11) DEFAULT NULL,
  `assignedToLabel` varchar(45) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `status` varchar(45) DEFAULT NULL,
  `automationId` char(11) DEFAULT NULL,
  `conversationId` char(11) DEFAULT NULL,
  `data` text,
  PRIMARY KEY (`id`),
  KEY `idx_church_status` (`churchId`, `status`),
  KEY `idx_automation` (`churchId`, `automationId`),
  KEY `idx_assigned` (`churchId`, `assignedToType`, `assignedToId`),
  KEY `idx_created` (`churchId`, `createdByType`, `createdById`)
);
