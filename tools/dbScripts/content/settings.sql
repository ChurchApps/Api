DROP TABLE IF EXISTS `settings`;

CREATE TABLE `settings` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `userId` char(11) DEFAULT NULL,
  `keyName` varchar(255) DEFAULT NULL,
  `value` mediumtext,
  `public` bit(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  KEY `churchId` (`churchId`),
  KEY `ix_churchId_keyName_userId` (`churchId`, `keyName`, `userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;