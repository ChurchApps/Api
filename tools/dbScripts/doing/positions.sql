DROP TABLE IF EXISTS `positions`;

CREATE TABLE `positions` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `planId` char(11) DEFAULT NULL,
  `categoryName` varchar(45) DEFAULT NULL,
  `name` varchar(45) DEFAULT NULL,
  `count` int(11) DEFAULT NULL,
  `groupId` char(11) DEFAULT NULL,
  `allowSelfSignup` bit(1) DEFAULT b'0',
  `description` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_church_plan` (`churchId`, `planId`),
  KEY `idx_group` (`groupId`)
);