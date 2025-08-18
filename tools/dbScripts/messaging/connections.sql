DROP TABLE IF EXISTS `connections`;

CREATE TABLE `connections` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `conversationId` char(11) DEFAULT NULL,
  `personId` char(11) DEFAULT NULL,
  `displayName` varchar(45) DEFAULT NULL,
  `timeJoined` datetime DEFAULT NULL,
  `socketId` varchar(45) DEFAULT NULL,
  `ipAddress` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_churchId` (`churchId`,`conversationId`)
) ENGINE=InnoDB;
