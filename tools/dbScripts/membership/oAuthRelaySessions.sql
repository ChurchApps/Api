CREATE TABLE `oAuthRelaySessions` (
  `id` char(11) NOT NULL,
  `sessionCode` varchar(16) NOT NULL,
  `provider` varchar(45) NOT NULL,
  `authCode` varchar(512) DEFAULT NULL,
  `redirectUri` varchar(512) NOT NULL,
  `status` enum('pending','completed','expired') DEFAULT 'pending',
  `expiresAt` datetime NOT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sessionCode` (`sessionCode`),
  KEY `status_expiresAt` (`status`, `expiresAt`)
) ENGINE=InnoDB;
