CREATE TABLE `arrangementKeys` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `arrangementId` char(11) DEFAULT NULL,
  `keySignature` varchar(10) DEFAULT NULL,
  `shortDescription` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;
