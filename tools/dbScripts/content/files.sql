DROP TABLE IF EXISTS `files`;

CREATE TABLE `files` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `contentType` varchar(45) DEFAULT NULL,
  `contentId` char(11) DEFAULT NULL,
  `fileName` varchar(255) DEFAULT NULL,
  `contentPath` varchar(1024) DEFAULT NULL,
  `fileType` varchar(45) DEFAULT NULL,
  `size` int(11) DEFAULT NULL,
  `dateModified` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_churchId_id` (`churchId`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;