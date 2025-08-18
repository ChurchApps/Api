DROP TABLE IF EXISTS `sessions`;

CREATE TABLE `sessions` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `groupId` char(11) DEFAULT NULL,
  `serviceTimeId` char(11) DEFAULT NULL,
  `sessionDate` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  KEY `churchId` (`churchId`),
  KEY `groupId` (`groupId`),
  KEY `serviceTimeId` (`serviceTimeId`),
  KEY `idx_church_session_date` (`churchId`, `sessionDate`),
  KEY `idx_church_group_service` (`churchId`, `groupId`, `serviceTimeId`)
) ENGINE=InnoDB;