DROP TABLE IF EXISTS `blockoutDates`;

CREATE TABLE `blockoutDates` (
  `id` CHAR(11) NOT NULL,
  `churchId` CHAR(11) NULL,
  `personId` CHAR(11) NULL,
  `startDate` DATE NULL,
  `endDate` DATE NULL,
  PRIMARY KEY (`id`)
);
