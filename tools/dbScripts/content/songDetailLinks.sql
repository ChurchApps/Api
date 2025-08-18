CREATE TABLE `songDetailLinks` (
  `id` char(11) NOT NULL,
  `songDetailId` char(11) DEFAULT NULL,
  `service` varchar(45) DEFAULT NULL,
  `serviceKey` varchar(255) DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;
