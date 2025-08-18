DROP TABLE IF EXISTS `subscriptionFunds`;

CREATE TABLE `subscriptionFunds` (
  `id` char(11) NOT NULL,
  `churchId` varchar(11) NOT NULL,
  `subscriptionId` varchar(255) DEFAULT NULL,
  `fundId` char(11) DEFAULT NULL,
  `amount` double DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_church_subscription` (`churchId`, `subscriptionId`),
  KEY `idx_church_fund` (`churchId`, `fundId`)
) ENGINE=InnoDB;