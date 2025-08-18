DROP TABLE IF EXISTS `visitSessions`;

CREATE TABLE `visitSessions` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `visitId` char(11) DEFAULT NULL,
  `sessionId` char(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  KEY `churchId` (`churchId`),
  KEY `visitId` (`visitId`),
  KEY `sessionId` (`sessionId`)
) ENGINE=InnoDB;
