CREATE TABLE `globalStyles` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `fonts` text,
  `palette` varchar(255) DEFAULT NULL,
  `customCss` text,
  `customJS` text,
  PRIMARY KEY (`id`)
);
