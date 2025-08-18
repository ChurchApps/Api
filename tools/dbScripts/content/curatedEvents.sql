CREATE TABLE `curatedEvents` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `curatedCalendarId` char(11) DEFAULT NULL,
  `groupId` char(11) DEFAULT NULL,
  `eventId` char(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_churchId_curatedCalendarId` (`churchId`, `curatedCalendarId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
