DROP TABLE IF EXISTS `blocks`;

CREATE TABLE `blocks` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `blockType` varchar(45) DEFAULT NULL,
  `name` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
