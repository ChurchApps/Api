CREATE TABLE `sermons` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `playlistId` char(11) DEFAULT NULL,
  `videoType` varchar(45) DEFAULT NULL,
  `videoData` varchar(255) DEFAULT NULL,
  `videoUrl` varchar(1024) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `description` text,
  `publishDate` datetime DEFAULT NULL,
  `thumbnail` varchar(1024) DEFAULT NULL,
  `duration` int(11) DEFAULT NULL,
  `permanentUrl` bit(1) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
