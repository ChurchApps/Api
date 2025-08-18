DROP TABLE IF EXISTS `services`;

CREATE TABLE `services` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `campusId` char(11) DEFAULT NULL,
  `name` varchar(50) DEFAULT NULL,
  `removed` bit(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  KEY `churchId` (`churchId`),
  KEY `campusId` (`campusId`)
) ENGINE=InnoDB;