DROP TABLE IF EXISTS `times`;

CREATE TABLE `times` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `planId` char(11) DEFAULT NULL,
  `displayName` varchar(45) DEFAULT NULL,
  `startTime` datetime DEFAULT NULL,
  `endTime` datetime DEFAULT NULL,
  `teams` varchar(1000) DEFAULT NULL,
  PRIMARY KEY (`id`)
);
