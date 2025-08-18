DROP TABLE IF EXISTS `subscriptions`;

CREATE TABLE `subscriptions` (
  `id` varchar(255) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `personId` char(11) DEFAULT NULL,
  `customerId` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;