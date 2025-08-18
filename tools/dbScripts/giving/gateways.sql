DROP TABLE IF EXISTS `gateways`;

CREATE TABLE `gateways` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `provider` varchar(50) DEFAULT NULL,
  `publicKey` varchar(255) DEFAULT NULL,
  `privateKey` varchar(255) DEFAULT NULL,
  `webhookKey` varchar(255) DEFAULT NULL,
  `productId` varchar(255) DEFAULT NULL,
  `payFees` bit(1) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`)
) ENGINE=InnoDB;