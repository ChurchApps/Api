DROP TABLE IF EXISTS `messages`;

CREATE TABLE `messages` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `conversationId` char(11) DEFAULT NULL,
  `displayName` varchar(45) DEFAULT NULL,
  `timeSent` datetime DEFAULT NULL,
  `messageType` varchar(45) DEFAULT NULL,
  `content` text,
  `personId` char(11) DEFAULT NULL,
  `timeUpdated` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_churchId` (`churchId`,`conversationId`),
  KEY `ix_timeSent` (`timeSent`),
  KEY `ix_personId` (`personId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
