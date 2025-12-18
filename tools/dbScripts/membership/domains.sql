DROP TABLE IF EXISTS `domains`;

CREATE TABLE `domains` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `domainName` varchar(255) DEFAULT NULL,
  `lastChecked` datetime DEFAULT NULL,
  `isStale` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;