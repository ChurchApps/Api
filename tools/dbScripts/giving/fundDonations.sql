DROP TABLE IF EXISTS `fundDonations`;

CREATE TABLE `fundDonations` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `donationId` char(11) DEFAULT NULL,
  `fundId` char(11) DEFAULT NULL,
  `amount` double DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  KEY `idx_church_donation` (`churchId`, `donationId`),
  KEY `idx_church_fund` (`churchId`, `fundId`)
) ENGINE=InnoDB;