CREATE TABLE `arrangements` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `songId` char(11) DEFAULT NULL,
  `songDetailId` char(11) DEFAULT NULL,
  `name` varchar(45) DEFAULT NULL,
  `lyrics` text,
  `freeShowId` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_churchId_songId` (`churchId`, `songId`)
) ENGINE=InnoDB;
