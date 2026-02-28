DROP TABLE IF EXISTS `auditLogs`;

CREATE TABLE `auditLogs` (
  `id` char(11) NOT NULL,
  `churchId` char(11) NOT NULL,
  `userId` char(11) DEFAULT NULL,
  `category` varchar(50) NOT NULL,
  `action` varchar(100) NOT NULL,
  `entityType` varchar(100) DEFAULT NULL,
  `entityId` char(11) DEFAULT NULL,
  `details` text DEFAULT NULL,
  `ipAddress` varchar(45) DEFAULT NULL,
  `created` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_auditLogs_church_created` (`churchId`, `created`),
  KEY `ix_auditLogs_church_category` (`churchId`, `category`),
  KEY `ix_auditLogs_church_userId` (`churchId`, `userId`),
  KEY `ix_auditLogs_church_entity` (`churchId`, `entityType`, `entityId`)
) ENGINE=InnoDB;
