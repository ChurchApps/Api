DROP INDEX `idx_church_plan` ON `positions`;--> statement-breakpoint
CREATE INDEX `idx_pos_church_plan` ON `positions` (`churchId`,`planId`);