CREATE TABLE IF NOT EXISTS `registrationMembers` (
  `id` char(11) NOT NULL,
  `churchId` char(11) NOT NULL,
  `registrationId` char(11) NOT NULL,
  `personId` char(11) DEFAULT NULL,
  `firstName` varchar(100) DEFAULT NULL,
  `lastName` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_regMembers_registrationId` (`registrationId`),
  KEY `ix_regMembers_personId` (`personId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
