CREATE TABLE IF NOT EXISTS `registrations` (
  `id` char(11) NOT NULL,
  `churchId` char(11) NOT NULL,
  `eventId` char(11) NOT NULL,
  `personId` char(11) DEFAULT NULL,
  `householdId` char(11) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'pending',
  `formSubmissionId` char(11) DEFAULT NULL,
  `notes` mediumtext DEFAULT NULL,
  `registeredDate` datetime DEFAULT NULL,
  `cancelledDate` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_registrations_churchId_eventId` (`churchId`, `eventId`),
  KEY `ix_registrations_personId` (`personId`),
  KEY `ix_registrations_householdId` (`householdId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
