DROP TABLE IF EXISTS `blockedIps`;

CREATE TABLE `blockedIps` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `conversationId` char(11) DEFAULT NULL,
  `serviceId` char(11) DEFAULT NULL,
  `ipAddress` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;