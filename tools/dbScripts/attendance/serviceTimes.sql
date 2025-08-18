DROP TABLE IF EXISTS `serviceTimes`;

CREATE TABLE `serviceTimes` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `serviceId` char(11) DEFAULT NULL,
  `name` varchar(50) DEFAULT NULL,
  `removed` bit(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  KEY `churchId` (`churchId`),
  KEY `serviceId` (`serviceId`),
  KEY `idx_church_service_removed` (`churchId`, `serviceId`, `removed`)
) ENGINE=InnoDB;