DROP TABLE IF EXISTS `funds`;

CREATE TABLE `funds` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `name` varchar(50) DEFAULT NULL,
  `removed` bit(1) DEFAULT NULL,
  `productId` varchar(50) DEFAULT NULL,
  `taxDeductible` bit(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`),
  KEY `idx_church_removed` (`churchId`, `removed`)
) ENGINE=InnoDB;