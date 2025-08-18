DROP TABLE IF EXISTS `donationBatches`;

CREATE TABLE `donationBatches` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `name` varchar(50) DEFAULT NULL,
  `batchDate` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  KEY `idx_church_id` (`churchId`)
) ENGINE=InnoDB;
