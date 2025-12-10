DROP TABLE IF EXISTS `links`;

CREATE TABLE `links` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `category` varchar(45) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `linkType` varchar(45) DEFAULT NULL,
  `linkData` varchar(255) DEFAULT NULL,
  `icon` varchar(45) DEFAULT NULL,
  `text` varchar(255) DEFAULT NULL,
  `sort` float DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `parentId` char(11) DEFAULT NULL,
  `visibility` varchar(45) DEFAULT 'everyone',
  `groupIds` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `churchId` (`churchId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;