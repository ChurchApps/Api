CREATE TABLE `notifications` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `personId` char(11) DEFAULT NULL,
  `contentType` varchar(45) DEFAULT NULL,
  `contentId` char(11) DEFAULT NULL,
  `timeSent` datetime DEFAULT NULL,
  `isNew` bit(1) DEFAULT NULL,
  `message` text,
  `link` varchar(100) DEFAULT NULL,
  `deliveryMethod` varchar(10) DEFAULT NULL,
  `triggeredByPersonId` char(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `churchId_personId_timeSent` (`churchId`, `personId`, `timeSent`),
  KEY `isNew` (`isNew`)
) ENGINE=InnoDB;

-- Migration for existing databases:
-- ALTER TABLE notifications ADD COLUMN triggeredByPersonId char(11) DEFAULT NULL; 