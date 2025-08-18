DROP TABLE IF EXISTS `sections`;

CREATE TABLE `sections` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `pageId` char(11) DEFAULT NULL,
  `blockId` char(11) DEFAULT NULL,
  `zone` varchar(45) DEFAULT NULL,
  `background` varchar(255) DEFAULT NULL,
  `textColor` varchar(45) DEFAULT NULL,
  `headingColor` varchar(45) DEFAULT NULL,
  `linkColor` varchar(45) DEFAULT NULL,
  `sort` float DEFAULT NULL,
  `targetBlockId` char(11) DEFAULT NULL,
  `answersJSON` mediumtext,
  `stylesJSON` mediumtext,
  `animationsJSON` mediumtext,
  PRIMARY KEY (`id`),
  KEY `ix_churchId_pageId_sort` (`churchId`, `pageId`, `sort`),
  KEY `ix_churchId_blockId_sort` (`churchId`, `blockId`, `sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
