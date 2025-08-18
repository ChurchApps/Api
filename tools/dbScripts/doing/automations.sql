DROP TABLE IF EXISTS `automations`;

CREATE TABLE `automations` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `title` varchar(45) DEFAULT NULL,
  `recurs` varchar(45) DEFAULT NULL,
  `active` bit(1) DEFAULT NULL,
  PRIMARY KEY (`id`)
);
