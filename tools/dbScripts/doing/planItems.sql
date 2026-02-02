DROP TABLE IF EXISTS `planItems`;

CREATE TABLE `planItems` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `planId` char(11) DEFAULT NULL,
  `parentId` char(11) DEFAULT NULL,
  `sort` float DEFAULT NULL,
  `itemType` varchar(45) DEFAULT NULL,
  `relatedId` char(11) DEFAULT NULL,
  `label` varchar(45) DEFAULT NULL,
  `description` varchar(1000) DEFAULT NULL,
  `seconds` int(11) DEFAULT NULL,
  `link` varchar(1000) DEFAULT NULL,
  `providerId` varchar(50) DEFAULT NULL,
  `providerPath` varchar(500) DEFAULT NULL,
  `providerContentPath` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_church_plan` (`churchId`, `planId`),
  KEY `idx_parent` (`parentId`)
); 