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
  `currency` varchar(10) DEFAULT NULL,
  `settings` json DEFAULT NULL,
  `environment` varchar(50) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`)
) ENGINE=InnoDB;
