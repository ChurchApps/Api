DROP TABLE IF EXISTS `elements`;

CREATE TABLE `elements` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `sectionId` char(11) DEFAULT NULL,
  `blockId` char(11) DEFAULT NULL,
  `elementType` varchar(45) DEFAULT NULL,
  `sort` float DEFAULT NULL,
  `parentId` char(11) DEFAULT NULL,
  `answersJSON` mediumtext,
  `stylesJSON` mediumtext,
  `animationsJSON` mediumtext,
  PRIMARY KEY (`id`),
  KEY `ix_churchId_blockId_sort` (`churchId`, `blockId`, `sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
