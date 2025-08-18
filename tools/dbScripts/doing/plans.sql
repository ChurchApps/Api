DROP TABLE IF EXISTS `plans`;

CREATE TABLE `plans` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `ministryId` char(11) DEFAULT NULL,
  `planTypeId` char(11) DEFAULT NULL,
  `name` varchar(45) DEFAULT NULL,
  `serviceDate` date DEFAULT NULL,
  `notes` mediumtext,
  `serviceOrder` bit(1) DEFAULT NULL,
  `contentType` varchar(50) DEFAULT NULL,
  `contentId` char(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
);
