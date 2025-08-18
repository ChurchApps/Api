CREATE TABLE `playlists` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `description` text,
  `publishDate` datetime DEFAULT NULL,
  `thumbnail` varchar(1024) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
