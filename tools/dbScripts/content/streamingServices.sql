DROP TABLE IF EXISTS `streamingServices`;
CREATE TABLE `streamingServices` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `serviceTime` datetime DEFAULT NULL,
  `earlyStart` int(11) DEFAULT NULL,
  `chatBefore` int(11) DEFAULT NULL,
  `chatAfter` int(11) DEFAULT NULL,
  `provider` varchar(45) DEFAULT NULL,
  `providerKey` varchar(255) DEFAULT NULL,
  `videoUrl` varchar(5000) DEFAULT NULL,
  `timezoneOffset` int(11) DEFAULT NULL,
  `recurring` tinyint(4) DEFAULT NULL,
  `label` varchar(255) DEFAULT NULL,
  `sermonId` char(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_UNIQUE` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
