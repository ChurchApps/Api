CREATE TABLE `songs` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `name` varchar(45) DEFAULT NULL,
  `dateAdded` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_churchId_name` (`churchId`, `name`)
) ENGINE=InnoDB;
