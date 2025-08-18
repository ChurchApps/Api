CREATE TABLE `bibleChapters` (
  `id` char(11) NOT NULL,
  `translationKey` varchar(45) DEFAULT NULL,
  `bookKey` varchar(45) DEFAULT NULL,
  `keyName` varchar(45) DEFAULT NULL,
  `number` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_translationKey_bookKey` (`translationKey`,`bookKey`)
) ENGINE=InnoDB;