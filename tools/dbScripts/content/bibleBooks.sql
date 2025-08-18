CREATE TABLE `bibleBooks` (
  `id` char(11) NOT NULL,
  `translationKey` varchar(45) DEFAULT NULL,
  `keyName` varchar(45) DEFAULT NULL,
  `abbreviation` varchar(45) DEFAULT NULL,
  `name` varchar(45) DEFAULT NULL,
  `sort` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_translationKey` (`translationKey`)
) ENGINE=InnoDB;
