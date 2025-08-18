DROP TABLE IF EXISTS `eventExceptions`;

CREATE TABLE `eventExceptions` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `eventId` char(11) DEFAULT NULL,
  `exceptionDate` datetime DEFAULT NULL,
  `recurrenceDate` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


