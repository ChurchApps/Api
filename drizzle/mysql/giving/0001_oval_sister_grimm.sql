DROP INDEX `idx_church_fund` ON `subscriptionFunds`;--> statement-breakpoint
CREATE INDEX `idx_sub_church_fund` ON `subscriptionFunds` (`churchId`,`fundId`);