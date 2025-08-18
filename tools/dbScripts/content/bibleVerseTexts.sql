CREATE TABLE `bibleVerseTexts` (
  `id` char(11) NOT NULL,
  `translationKey` varchar(45) DEFAULT NULL,
  `verseKey` varchar(45) DEFAULT NULL,
  `bookKey` varchar(45) DEFAULT NULL,
  `chapterNumber` int DEFAULT NULL,
  `verseNumber` int DEFAULT NULL,
  `content` varchar(1000) DEFAULT NULL,
  `newParagraph` bit DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_translationKey_verseKey` (`translationKey`,`verseKey`),
  KEY `ix_translationKey_verseKey` (`translationKey`,`verseKey`)
) ENGINE=InnoDB;