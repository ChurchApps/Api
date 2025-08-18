DROP TABLE IF EXISTS `donations`;

CREATE TABLE `donations` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `batchId` char(11) DEFAULT NULL,
  `personId` char(11) DEFAULT NULL,
  `donationDate` datetime DEFAULT NULL,
  `amount` double DEFAULT NULL,
  `method` varchar(50) DEFAULT NULL,
  `methodDetails` varchar(255) DEFAULT NULL,
  `notes` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  KEY `idx_church_donation_date` (`churchId`, `donationDate`),
  KEY `idx_church_person` (`churchId`, `personId`),
  KEY `idx_church_batch` (`churchId`, `batchId`),
  KEY `idx_church_method` (`churchId`, `method`, `methodDetails`)
) ENGINE=InnoDB;
