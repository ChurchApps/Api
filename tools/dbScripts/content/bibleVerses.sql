CREATE TABLE `bibleVerses` (
  `id` char(11) NOT NULL,
  `translationKey` varchar(45) DEFAULT NULL,
  `chapterKey` varchar(45) DEFAULT NULL,
  `keyName` varchar(45) DEFAULT NULL,
  `number` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_translationKey_chapterKey` (`translationKey`,`chapterKey`)
) ENGINE=InnoDB;