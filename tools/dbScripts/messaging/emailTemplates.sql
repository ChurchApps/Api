CREATE TABLE IF NOT EXISTS `emailTemplates` (
  `id` char(11) NOT NULL,
  `churchId` char(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `subject` varchar(500) NOT NULL,
  `htmlContent` text NOT NULL,
  `category` varchar(100) DEFAULT NULL,
  `dateCreated` datetime DEFAULT CURRENT_TIMESTAMP,
  `dateModified` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_churchId` (`churchId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
