DROP TABLE IF EXISTS `eventLogs`;

CREATE TABLE `eventLogs` (
  `id` varchar(255) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `customerId` varchar(255) DEFAULT NULL,
  `provider` varchar(50) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `eventType` varchar(50) DEFAULT NULL,
  `message` text,
  `created` datetime DEFAULT NULL,
  `resolved` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_church_status_created` (`churchId`, `status`, `created`),
  KEY `idx_customer` (`customerId`)
) ENGINE=InnoDB;