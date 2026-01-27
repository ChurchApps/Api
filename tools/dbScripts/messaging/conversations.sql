DROP TABLE IF EXISTS `conversations`;

CREATE TABLE `conversations` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `contentType` varchar(45) DEFAULT NULL,
  `contentId` varchar(255) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `dateCreated` datetime DEFAULT NULL,
  `groupId` char(11) DEFAULT NULL,
  `visibility` varchar(45) DEFAULT NULL,
  `firstPostId` char(11) DEFAULT NULL,
  `lastPostId` char(11) DEFAULT NULL,
  `postCount` int(11) DEFAULT NULL,
  `postType` varchar(45) DEFAULT 'discussion',
  `allowAnonymousPosts` bit(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_churchId` (`churchId`,`contentType`,`contentId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
