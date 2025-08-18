DROP TABLE IF EXISTS `assignments`;

CREATE TABLE `assignments` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `positionId` char(11) DEFAULT NULL,
  `personId` char(11) DEFAULT NULL,
  `status` varchar(45) DEFAULT NULL,
  `notified` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_church_person` (`churchId`, `personId`),
  KEY `idx_position` (`positionId`)
);
