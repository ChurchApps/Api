CREATE TABLE `bibleTranslations` (
  `id` char(11)   NOT NULL,
  `abbreviation` varchar(10)   DEFAULT NULL,
  `name` varchar(255)   DEFAULT NULL,
  `nameLocal` varchar(255)   DEFAULT NULL,
  `description` varchar(1000)   DEFAULT NULL,
  `source` varchar(45)   DEFAULT NULL,
  `sourceKey` varchar(45)   DEFAULT NULL,
  `language` varchar(45)   DEFAULT NULL,
  `countries` varchar(255)   DEFAULT NULL,
  `copyright` varchar(1000)   DEFAULT NULL,
  `attributionRequired` bit DEFAULT NULL,
  `attributionString` VARCHAR(1000) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;