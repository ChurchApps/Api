DROP TABLE IF EXISTS `contentProviderAuths`;

CREATE TABLE `contentProviderAuths` (
  `id` char(11) NOT NULL,
  `churchId` char(11) DEFAULT NULL,
  `ministryId` char(11) DEFAULT NULL,
  `providerId` varchar(50) DEFAULT NULL,
  `accessToken` text DEFAULT NULL,
  `refreshToken` text DEFAULT NULL,
  `tokenType` varchar(50) DEFAULT NULL,
  `expiresAt` datetime DEFAULT NULL,
  `scope` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ministry_provider` (`churchId`, `ministryId`, `providerId`)
);
