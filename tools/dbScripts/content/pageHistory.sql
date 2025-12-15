CREATE TABLE `pageHistory` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `pageId` char(11) DEFAULT NULL,
  `blockId` char(11) DEFAULT NULL,
  `snapshotJSON` longtext,
  `description` varchar(200) DEFAULT NULL,
  `userId` char(11) DEFAULT NULL,
  `createdDate` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_pageId` (`pageId`, `createdDate`),
  KEY `ix_blockId` (`blockId`, `createdDate`)
);
