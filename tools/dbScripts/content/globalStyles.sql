CREATE TABLE `globalStyles` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `fonts` text,
  `palette` text,
  `typography` text,
  `spacing` text,
  `borderRadius` text,
  `customCss` text,
  `customJS` text,
  PRIMARY KEY (`id`)
);
