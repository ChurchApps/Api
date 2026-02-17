CREATE TABLE `sentTexts` (
  `id` char(11) NOT NULL,
  `churchId` char(11) NOT NULL,
  `groupId` char(11),
  `recipientPersonId` char(11),
  `senderPersonId` char(11),
  `message` varchar(1600),
  `recipientCount` int DEFAULT 0,
  `successCount` int DEFAULT 0,
  `failCount` int DEFAULT 0,
  `timeSent` datetime,
  PRIMARY KEY (`id`),
  KEY `ix_churchId` (`churchId`, `timeSent`)
) ENGINE=InnoDB;
