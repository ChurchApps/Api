CREATE TABLE `textingProviders` (
  `id` char(11) NOT NULL,
  `churchId` char(11) NOT NULL,
  `provider` varchar(50) NOT NULL,
  `apiKey` varchar(500),
  `apiSecret` varchar(500),
  `fromNumber` varchar(20),
  `enabled` bit(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `ix_churchId` (`churchId`)
) ENGINE=InnoDB;
