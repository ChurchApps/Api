CREATE TABLE `deliveryLogs` (
  `id` char(11) NOT NULL,
  `churchId` char(11),
  `personId` char(11),
  `contentType` varchar(20),
  `contentId` char(11),
  `deliveryMethod` varchar(10),
  `success` bit(1),
  `errorMessage` varchar(500),
  `deliveryAddress` varchar(255),
  `attemptTime` datetime,
  PRIMARY KEY (`id`),
  KEY `ix_content` (`contentType`, `contentId`),
  KEY `ix_personId` (`personId`, `attemptTime`),
  KEY `ix_churchId_time` (`churchId`, `attemptTime`)
) ENGINE=InnoDB;
