CREATE TABLE `privateMessages` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `fromPersonId` char(11) DEFAULT NULL,
  `toPersonId` char(11) DEFAULT NULL,
  `conversationId` char(11) DEFAULT NULL,
  `notifyPersonId` char(11) DEFAULT NULL,
  `deliveryMethod` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `IX_churchFrom` (`churchId`,`fromPersonId`),
  KEY `IX_churchTo` (`churchId`,`toPersonId`),
  KEY `IX_notifyPersonId` (`churchId`, `notifyPersonId`),
  KEY `IX_conversationId` (`conversationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
