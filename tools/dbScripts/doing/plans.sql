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
  `providerId` varchar(50) DEFAULT NULL,
  `providerPlanId` varchar(100) DEFAULT NULL,
  `providerPlanName` varchar(255) DEFAULT NULL,
  `signupDeadlineHours` int(11) DEFAULT NULL,
  `showVolunteerNames` bit(1) DEFAULT b'1',
  PRIMARY KEY (`id`)
);
