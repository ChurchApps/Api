CREATE TABLE `deviceContents` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `deviceId` char(11) DEFAULT NULL,
  `contentType` varchar(45) DEFAULT NULL,
  `contentId` char(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;
