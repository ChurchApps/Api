CREATE TABLE `songDetails` (
  `id` char(11) NOT NULL,
  `praiseChartsId` varchar(45) DEFAULT NULL,
  `musicBrainzId` varchar(45) DEFAULT NULL,
  `title` varchar(45) DEFAULT NULL,
  `artist` varchar(45) DEFAULT NULL,
  `album` varchar(45) DEFAULT NULL,
  `language` varchar(5) DEFAULT NULL,
  `thumbnail` varchar(255) DEFAULT NULL,
  `releaseDate` date DEFAULT NULL,
  `bpm` int(11) DEFAULT NULL,
  `keySignature` varchar(5) DEFAULT NULL,
  `seconds` int(11) DEFAULT NULL,
  `meter` varchar(10) DEFAULT NULL,
  `tones` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;
