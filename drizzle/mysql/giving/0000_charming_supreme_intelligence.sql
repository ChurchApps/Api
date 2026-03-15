CREATE TABLE `customers` (
	`id` varchar(255) NOT NULL,
	`churchId` char(11),
	`personId` char(11),
	`provider` varchar(50),
	`metadata` json,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `donationBatches` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`name` varchar(50),
	`batchDate` datetime,
	CONSTRAINT `donationBatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `donations` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`batchId` char(11),
	`personId` char(11),
	`donationDate` datetime,
	`amount` double,
	`currency` varchar(10),
	`method` varchar(50),
	`methodDetails` varchar(255),
	`notes` text,
	`entryTime` datetime,
	`status` varchar(20) DEFAULT 'complete',
	`transactionId` varchar(255),
	CONSTRAINT `donations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `eventLogs` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`customerId` varchar(255),
	`provider` varchar(50),
	`providerId` varchar(255),
	`status` varchar(50),
	`eventType` varchar(50),
	`message` text,
	`created` datetime,
	`resolved` tinyint,
	CONSTRAINT `eventLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fundDonations` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`donationId` char(11),
	`fundId` char(11),
	`amount` double,
	CONSTRAINT `fundDonations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `funds` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`name` varchar(50),
	`removed` boolean,
	`productId` varchar(50),
	`taxDeductible` boolean,
	CONSTRAINT `funds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gatewayPaymentMethods` (
	`id` char(11) NOT NULL,
	`churchId` char(11) NOT NULL,
	`gatewayId` char(11) NOT NULL,
	`customerId` varchar(255) NOT NULL,
	`externalId` varchar(255) NOT NULL,
	`methodType` varchar(50),
	`displayName` varchar(255),
	`metadata` json,
	`createdAt` datetime,
	`updatedAt` datetime,
	CONSTRAINT `gatewayPaymentMethods_id` PRIMARY KEY(`id`),
	CONSTRAINT `ux_gateway_payment_methods_external` UNIQUE(`gatewayId`,`externalId`)
);
--> statement-breakpoint
CREATE TABLE `gateways` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`provider` varchar(50),
	`publicKey` varchar(255),
	`privateKey` varchar(255),
	`webhookKey` varchar(255),
	`productId` varchar(255),
	`payFees` boolean,
	`currency` varchar(10),
	`settings` json,
	`environment` varchar(50),
	`createdAt` datetime,
	`updatedAt` datetime,
	CONSTRAINT `gateways_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` char(11) NOT NULL,
	`churchId` char(11),
	`keyName` varchar(255),
	`value` mediumtext,
	`public` boolean,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptionFunds` (
	`id` char(11) NOT NULL,
	`churchId` varchar(11) NOT NULL,
	`subscriptionId` varchar(255),
	`fundId` char(11),
	`amount` double,
	CONSTRAINT `subscriptionFunds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` varchar(255) NOT NULL,
	`churchId` char(11),
	`personId` char(11),
	`customerId` varchar(255),
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_church_id` ON `donationBatches` (`churchId`);--> statement-breakpoint
CREATE INDEX `idx_church_donation_date` ON `donations` (`churchId`,`donationDate`);--> statement-breakpoint
CREATE INDEX `idx_church_person` ON `donations` (`churchId`,`personId`);--> statement-breakpoint
CREATE INDEX `idx_church_batch` ON `donations` (`churchId`,`batchId`);--> statement-breakpoint
CREATE INDEX `idx_church_method` ON `donations` (`churchId`,`method`,`methodDetails`);--> statement-breakpoint
CREATE INDEX `idx_church_status` ON `donations` (`churchId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_transaction` ON `donations` (`transactionId`);--> statement-breakpoint
CREATE INDEX `idx_church_status_created` ON `eventLogs` (`churchId`,`status`,`created`);--> statement-breakpoint
CREATE INDEX `idx_customer` ON `eventLogs` (`customerId`);--> statement-breakpoint
CREATE INDEX `idx_provider_id` ON `eventLogs` (`providerId`);--> statement-breakpoint
CREATE INDEX `idx_church_donation` ON `fundDonations` (`churchId`,`donationId`);--> statement-breakpoint
CREATE INDEX `idx_church_fund` ON `fundDonations` (`churchId`,`fundId`);--> statement-breakpoint
CREATE INDEX `idx_church_removed` ON `funds` (`churchId`,`removed`);--> statement-breakpoint
CREATE INDEX `idx_gateway_payment_methods_church` ON `gatewayPaymentMethods` (`churchId`);--> statement-breakpoint
CREATE INDEX `idx_gateway_payment_methods_customer` ON `gatewayPaymentMethods` (`customerId`);--> statement-breakpoint
CREATE INDEX `churchId` ON `settings` (`churchId`);--> statement-breakpoint
CREATE INDEX `idx_church_subscription` ON `subscriptionFunds` (`churchId`,`subscriptionId`);--> statement-breakpoint
CREATE INDEX `idx_sub_church_fund` ON `subscriptionFunds` (`churchId`,`fundId`);