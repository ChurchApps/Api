DROP TABLE IF EXISTS `events`;

CREATE TABLE `events` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `groupId` char(11) DEFAULT NULL,
  `allDay` bit(1) DEFAULT NULL,
  `start` datetime DEFAULT NULL,
  `end` datetime DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `description` mediumtext,
  `visibility` varchar(45) DEFAULT NULL,
  `recurrenceRule` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_churchId_groupId` (`churchId`, `groupId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
