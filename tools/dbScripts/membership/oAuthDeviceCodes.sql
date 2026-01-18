CREATE TABLE `oAuthDeviceCodes` (
  `id` char(11) NOT NULL,
  `deviceCode` varchar(64) NOT NULL,
  `userCode` varchar(16) NOT NULL,
  `clientId` varchar(45) NOT NULL,
  `scopes` varchar(255) DEFAULT NULL,
  `expiresAt` datetime NOT NULL,
  `pollInterval` int DEFAULT 5,
  `status` enum('pending','approved','denied','expired') DEFAULT 'pending',
  `approvedByUserId` char(11) DEFAULT NULL,
  `userChurchId` char(11) DEFAULT NULL,
  `churchId` char(11) DEFAULT NULL,
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `deviceCode` (`deviceCode`),
  KEY `userCode_status` (`userCode`, `status`),
  KEY `status_expiresAt` (`status`, `expiresAt`)
) ENGINE=InnoDB;
