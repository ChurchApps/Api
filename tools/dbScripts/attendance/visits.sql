DROP TABLE IF EXISTS `visits`;

CREATE TABLE `visits` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `personId` char(11) DEFAULT NULL,
  `serviceId` char(11) DEFAULT NULL,
  `groupId` char(11) DEFAULT NULL,
  `visitDate` datetime DEFAULT NULL,
  `checkinTime` datetime DEFAULT NULL,
  `addedBy` char(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  KEY `churchId` (`churchId`),
  KEY `personId` (`personId`),
  KEY `serviceId` (`serviceId`),
  KEY `groupId` (`groupId`),
  KEY `idx_church_visit_date` (`churchId`, `visitDate`),
  KEY `idx_church_person` (`churchId`, `personId`)
) ENGINE=InnoDB;