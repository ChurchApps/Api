DROP TABLE IF EXISTS `groupServiceTimes`;

CREATE TABLE `groupServiceTimes` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `groupId` char(11) DEFAULT NULL,
  `serviceTimeId` char(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  KEY `churchId` (`churchId`),
  KEY `groupId` (`groupId`),
  KEY `serviceTimeId` (`serviceTimeId`)
) ENGINE=InnoDB;