DROP TABLE IF EXISTS `conjunctions`;

CREATE TABLE `conjunctions` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `automationId` char(11) DEFAULT NULL,
  `parentId` char(11) DEFAULT NULL,
  `groupType` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`)
);
