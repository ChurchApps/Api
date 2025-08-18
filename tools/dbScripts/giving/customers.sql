DROP TABLE IF EXISTS `customers`;

CREATE TABLE `customers` (
  `id` varchar(255) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `personId` char(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`)
) ENGINE=InnoDB;