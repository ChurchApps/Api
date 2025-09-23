DROP TABLE IF EXISTS `gatewayPaymentMethods`;

CREATE TABLE `gatewayPaymentMethods` (
  `id` char(11) NOT NULL,
  `churchId` char(11) NOT NULL,
  `gatewayId` char(11) NOT NULL,
  `customerId` varchar(255) NOT NULL,
  `externalId` varchar(255) NOT NULL,
  `methodType` varchar(50) DEFAULT NULL,
  `displayName` varchar(255) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_gateway_payment_methods_external` (`gatewayId`,`externalId`),
  INDEX `idx_gateway_payment_methods_church` (`churchId`),
  INDEX `idx_gateway_payment_methods_customer` (`customerId`)
) ENGINE=InnoDB;
